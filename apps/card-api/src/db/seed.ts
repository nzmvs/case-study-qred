import { sql } from "kysely";
import type { Database } from "./database.js";
import { spendPeriodOf } from "../domain/spend-period.js";

// Fixed ids shared with the other services' seeds and the contract examples.
const ANNA = "00000000-0000-4000-a000-000000000001";
const COMPANY_AB = "00000000-0000-4000-a000-000000000101";
const NORDIC_TRADING = "00000000-0000-4000-a000-000000000102";
export const CARD_COMPANY_AB = "00000000-0000-4000-a000-000000000201";
export const CARD_NORDIC_TRADING = "00000000-0000-4000-a000-000000000202";

const MERCHANTS = ["Espresso House", "Clas Ohlson", "SJ AB", "Circle K", "Webhallen", "Ahlsell", "Pressbyrån", "Staples"];

const transactionId = (n: number) => `00000000-0000-4000-a000-${String(1000 + n).padStart(12, "0")}`;

type SeedTransaction = { amount: number; merchantName: string; occurredAt: Date; status: "pending" | "settled" | "reversed" };

/**
 * 57 Transactions on the Company AB Card: 30 settled last month, 27 this month of which one is
 * reversed. This month's pending and settled spend is exactly 4 600 kr, so Remaining spend is
 * 5 400 / 10 000 kr. Dates are relative to `now` so the demo shows current spend whenever it runs.
 */
function companyAbTransactions(now: Date): SeedTransaction[] {
  const thisMonth = spendPeriodOf(now).start;
  const lastMonth = spendPeriodOf(now, -1).start;
  const spread = (from: Date, to: Date, i: number, count: number) =>
    new Date(from.getTime() + ((to.getTime() - from.getTime()) * (i + 0.5)) / count);

  const previous = Array.from({ length: 30 }, (_, i) => ({
    amount: 5000 + ((i * 7919) % 60000),
    merchantName: MERCHANTS[i % MERCHANTS.length]!,
    occurredAt: spread(lastMonth, thisMonth, i, 30),
    status: "settled" as const,
  }));

  const latest = [
    { amount: 6400, merchantName: "Espresso House", status: "settled" as const },
    { amount: 34900, merchantName: "Clas Ohlson", status: "settled" as const },
    { amount: 89500, merchantName: "SJ AB", status: "pending" as const },
  ];
  const counted = 23;
  const target = 460000 - latest.reduce((sum, t) => sum + t.amount, 0);
  const amounts = Array.from({ length: counted - 1 }, (_, i) => 4000 + ((i * 3571) % 22000));
  amounts.push(target - amounts.reduce((sum, a) => sum + a, 0));

  const current = [
    ...amounts.map((amount, i) => ({ amount, merchantName: MERCHANTS[(i + 3) % MERCHANTS.length]!, status: "settled" as const })),
    { amount: 25000, merchantName: "Webhallen", status: "reversed" as const },
    ...latest,
  ].map((t, i, all) => ({ ...t, occurredAt: spread(thisMonth, now, i, all.length) }));

  return [...previous, ...current];
}

export async function seedIfEmpty(db: Database, now = new Date()): Promise<void> {
  const existing = await db.selectFrom("cards").select(db.fn.countAll<number>().as("count")).executeTakeFirstOrThrow();
  if (Number(existing.count) > 0) return;
  await seed(db, now);
}

export async function reseed(db: Database, now = new Date()): Promise<void> {
  await sql`TRUNCATE transactions, cards`.execute(db);
  await seed(db, now);
}

async function seed(db: Database, now: Date): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto("cards")
      .values([
        {
          id: CARD_COMPANY_AB,
          companyId: COMPANY_AB,
          holderUserId: ANNA,
          last4: "4821",
          expiryMonth: 9,
          expiryYear: 2029,
          expiresAt: new Date("2029-09-30T22:00:00Z"),
          currency: "SEK",
          spendingLimit: 1_000_000,
          status: "active",
          closedReason: null,
          createdAt: new Date("2026-01-12T09:00:00Z"),
          updatedAt: new Date("2026-01-14T07:30:00Z"),
        },
        {
          id: CARD_NORDIC_TRADING,
          companyId: NORDIC_TRADING,
          holderUserId: ANNA,
          last4: "7390",
          expiryMonth: 8,
          expiryYear: 2030,
          expiresAt: new Date("2030-08-31T22:00:00Z"),
          currency: "SEK",
          spendingLimit: 2_500_000,
          status: "inactive",
          closedReason: null,
          createdAt: new Date("2026-09-20T08:00:00Z"),
          updatedAt: new Date("2026-09-20T08:00:00Z"),
        },
      ])
      .execute();

    await tx
      .insertInto("transactions")
      .values(
        companyAbTransactions(now).map((t, i) => ({
          id: transactionId(i + 1),
          cardId: CARD_COMPANY_AB,
          amount: t.amount,
          currency: "SEK",
          merchantName: t.merchantName,
          occurredAt: t.occurredAt,
          status: t.status,
        })),
      )
      .execute();
  });
}
