import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("invoices")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("company_id", "uuid", (c) => c.notNull())
    .addColumn("amount", "bigint", (c) => c.notNull().check(sql`amount > 0`))
    .addColumn("currency", "char(3)", (c) => c.notNull())
    .addColumn("due_date", "date", (c) => c.notNull())
    // End of due_date in the Company's time zone, fixed when the Invoice is issued.
    .addColumn("due_at", "timestamptz", (c) => c.notNull())
    // Overdue is derived from due_at on read and never stored.
    .addColumn("status", "text", (c) => c.notNull().check(sql`status IN ('open', 'paid')`))
    .addColumn("issued_at", "timestamptz", (c) => c.notNull())
    .execute();

  await db.schema.createIndex("invoices_company_due_idx").on("invoices").columns(["company_id", "due_date"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("invoices").execute();
}
