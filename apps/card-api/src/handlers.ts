import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type Kysely, type Selectable, sql, type Transaction as DbTransaction } from "kysely";
import { type CardRow, etagOf, toCard } from "./cards/representation.js";
import type { DB, Transactions } from "./db/types.js";
import { CardStatus, checkClosedReason, effectiveStatus, resolveTransition } from "./domain/card-lifecycle.js";
import { spendPeriodOf } from "./domain/spend-period.js";
import { checkSpendingLimit, COUNTED_STATUSES, remainingSpend } from "./domain/spending-limit.js";
import { TransactionStatus } from "./domain/transaction-status.js";
import type { components, operations } from "./generated/card-api.js";
import { httpErrors } from "@qred/service-kit";
import { cardNotActive, cardNotFound, staleCard } from "./problems.js";

type Op = keyof operations;
type Path<K extends Op> = NonNullable<operations[K]["parameters"]["path"]>;
type Query<K extends Op> = NonNullable<operations[K]["parameters"]["query"]>;
type Headers<K extends Op> = NonNullable<operations[K]["parameters"]["header"]>;
type Body<K extends Op> = operations[K] extends { requestBody: { content: { "application/json": infer B } } } ? B : never;
type Transaction = components["schemas"]["Transaction"];

function visibleTo(row: CardRow, userId: string): boolean {
  return row.holderUserId === userId;
}

function toTransaction(row: Selectable<Transactions>): Transaction {
  return {
    id: row.id,
    cardId: row.cardId,
    amount: { amount: row.amount, currency: row.currency },
    merchantName: row.merchantName,
    occurredAt: row.occurredAt.toISOString(),
    status: row.status as Transaction["status"],
  };
}

const encodeCursor = (occurredAt: Date, id: string) =>
  Buffer.from(JSON.stringify([occurredAt.toISOString(), id])).toString("base64url");

function decodeCursor(cursor: string): [Date, string] {
  try {
    const [occurredAt, id] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as [string, string];
    const date = new Date(occurredAt);
    if (Number.isNaN(date.getTime()) || typeof id !== "string") throw new Error();
    return [date, id];
  } catch {
    throw httpErrors.badRequest("The cursor is not valid.");
  }
}

async function spentBetween(db: Kysely<DB> | DbTransaction<DB>, cardId: string, from: Date, to: Date): Promise<number> {
  const { spent } = await db
    .selectFrom("transactions")
    .select(sql<number>`coalesce(sum(amount), 0)::int8`.as("spent"))
    .where("cardId", "=", cardId)
    .where("occurredAt", ">=", from)
    .where("occurredAt", "<", to)
    .where("status", "in", COUNTED_STATUSES)
    .executeTakeFirstOrThrow();
  return spent;
}

export function cardHandlers({ db }: { db: Kysely<DB> }) {
  async function findVisible(cardId: string, userId: string): Promise<CardRow> {
    const row = await db.selectFrom("cards").selectAll().where("id", "=", cardId).executeTakeFirst();
    if (!row || !visibleTo(row, userId)) throw cardNotFound();
    return row;
  }

  return {
    async listCards(request: FastifyRequest<{ Querystring: Query<"listCards"> }>) {
      const { companyId, status } = request.query;

      const rows = await db
        .selectFrom("cards")
        .selectAll()
        .where("companyId", "=", companyId)
        .where("holderUserId", "=", request.userId)
        .orderBy("createdAt", "desc")
        .execute();
      const now = new Date();
      const cards = rows.map((row) => toCard(row, now));
      return { items: status ? cards.filter((card) => status.includes(card.state.status)) : cards };
    },

    async getCard(request: FastifyRequest<{ Params: Path<"getCard"> }>, reply: FastifyReply) {
      const card = toCard(await findVisible(request.params.cardId, request.userId), new Date());
      reply.header("ETag", etagOf(card));
      return card;
    },

    async putCard(
      request: FastifyRequest<{ Params: Path<"putCard">; Headers: Headers<"putCard">; Body: Body<"putCard"> }>,
      reply: FastifyReply,
    ) {
      const { settings, state } = request.body;
      return db.transaction().execute(async (tx) => {
        const row = await tx.selectFrom("cards").selectAll().where("id", "=", request.params.cardId).forUpdate().executeTakeFirst();
        if (!row || !visibleTo(row, request.userId)) throw cardNotFound();

        const now = new Date();
        const current = toCard(row, now);
        if (request.headers["if-match"] !== etagOf(current)) throw staleCard();

        const transition = resolveTransition(current.state.status, state.status);
        checkClosedReason(current.state, state.closedReason);

        if (!transition && settings.spendingLimit === row.spendingLimit) {
          reply.header("ETag", etagOf(current));
          return current;
        }

        const updated = await tx
          .updateTable("cards")
          .set({
            ...(transition ? { status: state.status, closedReason: state.closedReason } : {}),
            spendingLimit: settings.spendingLimit,
            updatedAt: now,
          })
          .where("id", "=", row.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        const card = toCard(updated, now);
        reply.header("ETag", etagOf(card));
        return card;
      });
    },

    async getCardSpend(request: FastifyRequest<{ Params: Path<"getCardSpend"> }>) {
      const row = await findVisible(request.params.cardId, request.userId);
      const period = spendPeriodOf(new Date());
      const spent = await spentBetween(db, row.id, period.start, period.end);
      const money = (amount: number) => ({ amount, currency: row.currency });
      return {
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        spendingLimit: money(row.spendingLimit),
        spent: money(spent),
        remaining: money(remainingSpend(row.spendingLimit, spent)),
      };
    },

    async listCardTransactions(
      request: FastifyRequest<{ Params: Path<"listCardTransactions">; Querystring: Query<"listCardTransactions"> }>,
    ) {
      const row = await findVisible(request.params.cardId, request.userId);
      const limit = request.query.limit ?? 20;
      const after = request.query.cursor ? decodeCursor(request.query.cursor) : undefined;

      const [rows, { totalCount }] = await Promise.all([
        db
          .selectFrom("transactions")
          .selectAll()
          .where("cardId", "=", row.id)
          .$if(after !== undefined, (q) =>
            q.where((eb) => eb(eb.refTuple("occurredAt", "id"), "<", eb.tuple(after![0], after![1]))),
          )
          .orderBy("occurredAt", "desc")
          .orderBy("id", "desc")
          .limit(limit + 1)
          .execute(),
        db
          .selectFrom("transactions")
          .select(sql<number>`count(*)::int8`.as("totalCount"))
          .where("cardId", "=", row.id)
          .executeTakeFirstOrThrow(),
      ]);

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toTransaction),
        totalCount,
        nextCursor: rows.length > limit && last ? encodeCursor(last.occurredAt, last.id) : null,
      };
    },

    async createCardTransaction(
      request: FastifyRequest<{ Params: Path<"createCardTransaction">; Body: Body<"createCardTransaction"> }>,
      reply: FastifyReply,
    ) {
      const { amount, merchantName } = request.body;
      const occurredAt = new Date(request.body.occurredAt);

      const created = await db.transaction().execute(async (tx) => {
        const row = await tx.selectFrom("cards").selectAll().where("id", "=", request.params.cardId).forUpdate().executeTakeFirst();
        if (!row) throw cardNotFound();

        const status = effectiveStatus(row.status as CardStatus, row.expiresAt, new Date());
        if (status !== CardStatus.Active) throw cardNotActive(status);
        if (amount.currency !== row.currency) throw httpErrors.unprocessableEntity(`The Card spends in ${row.currency}, not ${amount.currency}.`);

        const period = spendPeriodOf(occurredAt);
        const spent = await spentBetween(tx, row.id, period.start, period.end);
        checkSpendingLimit(amount.amount, row.spendingLimit, spent);

        return tx
          .insertInto("transactions")
          .values({
            id: randomUUID(),
            cardId: row.id,
            amount: amount.amount,
            currency: amount.currency,
            merchantName,
            occurredAt,
            status: TransactionStatus.Pending,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      });
      reply.code(201);
      return toTransaction(created);
    },
  };
}
