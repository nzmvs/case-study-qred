import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type Selectable, sql } from "kysely";
import type { Principal } from "./auth.js";
import { type CardRow, etagOf, toCard } from "./cards/representation.js";
import type { Database } from "./db/database.js";
import type { Transactions } from "./db/types.js";
import { CardStatus, effectiveStatus, resolveTransition } from "./domain/card-lifecycle.js";
import type { components, operations } from "./generated/card-api.js";
import { badRequest, cardNotActive, forbidden, notFound, preconditionFailed, unprocessable } from "./problems.js";

type Op = keyof operations;
type Path<K extends Op> = NonNullable<operations[K]["parameters"]["path"]>;
type Query<K extends Op> = NonNullable<operations[K]["parameters"]["query"]>;
type Headers<K extends Op> = NonNullable<operations[K]["parameters"]["header"]>;
type Body<K extends Op> = operations[K] extends { requestBody: { content: { "application/json": infer B } } } ? B : never;
type Transaction = components["schemas"]["Transaction"];

const TRANSACTIONS_WRITE = "transactions:write";
const COUNTED_STATUSES = ["pending", "settled"];

export type Clock = () => Date;

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
    throw badRequest("The cursor is not valid.");
  }
}

export function cardHandlers({ db, clock }: { db: Database; clock: Clock }) {
  async function findVisible(cardId: string, principal: Principal): Promise<CardRow> {
    const row = await db.selectFrom("cards").selectAll().where("id", "=", cardId).executeTakeFirst();
    if (!row || !visibleTo(row, principal)) throw notFound();
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
      const now = clock();
      // Filter after mapping: expired is derived, so the stored status cannot be filtered in SQL.
      const cards = rows.map((row) => toCard(row, now));
      return { items: status ? cards.filter((card) => status.includes(card.state.status)) : cards };
    },

    async getCard(request: FastifyRequest<{ Params: Path<"getCard"> }>, reply: FastifyReply) {
      const card = toCard(await findVisible(request.params.cardId, request.principal), clock());
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
        if (!row || !visibleTo(row, request.principal)) throw notFound();

        const now = clock();
        const current = toCard(row, now);
        if (etagOf(current) !== request.headers["if-match"]) throw preconditionFailed();

        const transition = resolveTransition(current.state.status, state.status);
        if (state.status === CardStatus.Closed) {
          if (!state.closedReason) throw unprocessable("closedReason is required when closing a card.");
          if (!transition && state.closedReason !== row.closedReason) throw unprocessable("A closed card's closedReason cannot change.");
        } else if (state.closedReason !== null) {
          throw unprocessable("closedReason must be null unless the card is closed.");
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
      if (!(from < to)) throw badRequest("`to` must be after `from`.");

      const { spent } = await db
        .selectFrom("transactions")
        .select(sql<number>`coalesce(sum(amount), 0)::int8`.as("spent"))
        .where("cardId", "=", row.id)
        .where("occurredAt", ">=", from)
        .where("occurredAt", "<", to)
        .where("status", "in", COUNTED_STATUSES)
        .executeTakeFirstOrThrow();
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
        throw forbidden(`Recording Transactions requires the ${TRANSACTIONS_WRITE} scope.`);
      }
      const row = await db.selectFrom("cards").selectAll().where("id", "=", request.params.cardId).executeTakeFirst();
      if (!row) throw notFound();

      const status = effectiveStatus(row.status as CardStatus, row.expiresAt, clock());
      if (status !== CardStatus.Active) throw cardNotActive(status);

      const { amount, merchantName, occurredAt } = request.body;
      if (amount.amount <= 0) throw unprocessable("amount must be positive.");
      if (amount.currency !== row.currency) throw unprocessable(`The Card spends in ${row.currency}, not ${amount.currency}.`);

      const created = await db
        .insertInto("transactions")
        .values({
          id: randomUUID(),
          cardId: row.id,
          amount: amount.amount,
          currency: amount.currency,
          merchantName,
          occurredAt: new Date(occurredAt),
          status: "pending",
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      reply.code(201);
      return toTransaction(created);
    },
  };
}
