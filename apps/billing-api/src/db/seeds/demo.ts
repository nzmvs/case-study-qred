import { type Kysely, sql } from "kysely";
import { InvoiceStatus, type StoredInvoiceStatus } from "../../domain/invoice-status.js";
import type { DB } from "../types.js";

// Fixed ids shared with the other services' seeds and the contract examples.
const COMPANY_AB = "00000000-0000-4000-a000-000000000101";
const OPEN_INVOICE = "00000000-0000-4000-a000-000000000301";
const PAID_INVOICE = "00000000-0000-4000-a000-000000000302";
const TIME_ZONE = "Europe/Stockholm";

/** Midnight at the start of `date` in the market's time zone, e.g. "2026-10-16T00:00:00+02:00". */
function localMidnight(date: string): Date {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  return new Date(`${date}T00:00:00${offset || "+00:00"}`);
}

const isoDate = (year: number, monthIndex: number, day: number) => new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);

export async function seed(db: Kysely<DB>): Promise<void> {
  await sql`TRUNCATE invoices`.execute(db);
  await insertDemoData(db, new Date());
}

/** Company AB: last month's Invoice paid, this month's due on the 15th of next month. Nordic Trading has none. */
async function insertDemoData(db: Kysely<DB>, now: Date): Promise<void> {
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()];
  const invoice = (id: string, monthOffset: number, amount: number, status: StoredInvoiceStatus) => {
    const dueDate = isoDate(y, m + monthOffset + 1, 15);
    return {
      id,
      companyId: COMPANY_AB,
      amount,
      currency: "SEK",
      dueDate,
      dueAt: localMidnight(isoDate(y, m + monthOffset + 1, 16)),
      status,
      issuedAt: localMidnight(isoDate(y, m + monthOffset, 15)),
    };
  };
  await db
    .insertInto("invoices")
    .values([invoice(PAID_INVOICE, -1, 987_500, InvoiceStatus.Paid), invoice(OPEN_INVOICE, 0, 1_249_000, InvoiceStatus.Open)])
    .execute();
}
