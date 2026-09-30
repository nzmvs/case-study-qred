import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type Selectable, sql, type Transaction as DbTransaction } from "kysely";
import { type CardRow, etagOf, toCard } from "./cards/representation.js";
import type { Database } from "./db/database.js";
import type { DB, Transactions } from "./db/types.js";
import { CardStatus, effectiveStatus, resolveTransition } from "./domain/card-lifecycle.js";
import { spendPeriodOf } from "./domain/spend-period.js";
import { TransactionStatus } from "./domain/transaction-status.js";
import type { components, operations } from "./generated/card-api.js";
import { httpErrors, type Principal } from "@qred/service-kit";
import { cardNotActive, cardNotFound, staleCard } from "./problems.js";

type Op = keyof operations;
type Path<K extends Op> = NonNullable<operations[K]["parameters"]["path"]>;
type Query<K extends Op> = NonNullable<operations[K]["parameters"]["query"]>;
type Headers<K extends Op> = NonNullable<operations[K]["parameters"]["header"]>;
type Body<K extends Op> = operations[K] extends { requestBody: { content: { "application/json": infer B } } } ? B : never;
type Transaction = components["schemas"]["Transaction"];

const TRANSACTIONS_WRITE = "transactions:write";
const COUNTED_STATUSES = [TransactionStatus.Pending, TransactionStatus.Settled];

function visibleTo(row: CardRow, principal: Principal): boolean {
  return principal.kind === "user" && principal.memberships.includes(row.companyId) && row.holderUserId === principal.userId;
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

async function spentBetween(db: Database | DbTransaction<DB>, cardId: string, from: Date, to: Date): Promise<number> {
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

export function cardHandlers({ db }: { db: Database }) {
  async function findVisible(cardId: string, principal: Principal): Promise<CardRow> {
    const row = await db.selectFrom("cards").selectAll().where("id", "=", cardId).executeTakeFirst();
    if (!row || !visibleTo(row, principal)) throw cardNotFound();
    return row;
  }

  return {
    async listCards(request: FastifyRequest<{ Querystring: Query<"listCards"> }>) {
      const { principal } = request;
      const { companyId, status } = request.query;
      if (principal.kind !== "user" || !principal.memberships.includes(companyId)) return { items: [] };

      const rows = await db
        .selectFrom("cards")
        .selectAll()
        .where("companyId", "=", companyId)
        .where("holderUserId", "=", principal.userId)
        .orderBy("createdAt", "desc")
        .execute();
      const now = new Date();
      // Filter after mapping: expired is derived, so the stored status cannot be filtered in SQL.
      const cards = rows.map((row) => toCard(row, now));
      return { items: status ? cards.filter((card) => status.includes(card.state.status)) : cards };
    },

    async getCard(request: FastifyRequest<{ Params: Path<"getCard"> }>, reply: FastifyReply) {
      const card = toCard(await findVisible(request.params.cardId, request.principal), new Date());
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
        if (!row || !visibleTo(row, request.principal)) throw cardNotFound();

        const now = new Date();
        const current = toCard(row, now);
        // `*` is refused on purpose: it would skip the ETag check that stops lost updates (ADR 0002).
        if (request.headers["if-match"] !== etagOf(current)) throw staleCard();

        const transition = resolveTransition(current.state.status, state.status);
        if (state.status === CardStatus.Closed) {
          if (!state.closedReason) throw httpErrors.unprocessableEntity("closedReason is required when closing a card.");
          if (!transition && state.closedReason !== row.closedReason) throw httpErrors.unprocessableEntity("A closed card's closedReason cannot change.");
        } else if (state.closedReason !== null) {
          throw httpErrors.unprocessableEntity("closedReason must be null unless the card is closed.");
        }

        if (!transition && settings.spendingLimit === row.spendingLimit) {
          reply.header("ETag", etagOf(current));
          return current;
        }

        const updated = await tx
          .updateTable("cards")
          .set({
            // Without a transition the stored status stays, even when the effective status is expired.
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

    async getCardSpend(request: FastifyRequest<{ Params: Path<"getCardSpend">; Querystring: Query<"getCardSpend"> }>) {
      const row = await findVisible(request.params.cardId, request.principal);
      const from = new Date(request.query.from);
      const to = new Date(request.query.to);
      if (to < from) throw httpErrors.badRequest("`to` must not be before `from`.");

      const spent = await spentBetween(db, row.id, from, to);
      return { from: request.query.from, to: request.query.to, spent: { amount: spent, currency: row.currency } };
    },

    async listCardTransactions(
      request: FastifyRequest<{ Params: Path<"listCardTransactions">; Querystring: Query<"listCardTransactions"> }>,
    ) {
      const row = await findVisible(request.params.cardId, request.principal);
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
      const { principal } = request;
      if (principal.kind !== "client" || !principal.scopes.includes(TRANSACTIONS_WRITE)) {
        throw httpErrors.forbidden(`Recording Transactions requires the ${TRANSACTIONS_WRITE} scope.`);
      }
      const { amount, merchantName } = request.body;
      const occurredAt = new Date(request.body.occurredAt);

      // The Card row lock serialises purchases on one Card, so concurrent ones cannot jointly exceed the limit.
      const created = await db.transaction().execute(async (tx) => {
        const row = await tx.selectFrom("cards").selectAll().where("id", "=", request.params.cardId).forUpdate().executeTakeFirst();
        if (!row) throw cardNotFound();

        const status = effectiveStatus(row.status as CardStatus, row.expiresAt, new Date());
        if (status !== CardStatus.Active) throw cardNotActive(status);
        if (amount.amount <= 0) throw httpErrors.unprocessableEntity("amount must be positive.");
        if (amount.currency !== row.currency) throw httpErrors.unprocessableEntity(`The Card spends in ${row.currency}, not ${amount.currency}.`);

        const period = spendPeriodOf(occurredAt);
        const spent = await spentBetween(tx, row.id, period.start, period.end);
        if (spent + amount.amount > row.spendingLimit) {
          throw httpErrors.unprocessableEntity(`The purchase exceeds the Remaining spend of ${Math.max(0, row.spendingLimit - spent)} for this Spend period.`);
        }

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
