import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("cards")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("company_id", "uuid", (c) => c.notNull())
    .addColumn("holder_user_id", "uuid", (c) => c.notNull())
    .addColumn("last4", "char(4)", (c) => c.notNull().check(sql`last4 ~ '^[0-9]{4}$'`))
    .addColumn("expiry_month", "smallint", (c) => c.notNull().check(sql`expiry_month BETWEEN 1 AND 12`))
    .addColumn("expiry_year", "smallint", (c) => c.notNull())
    .addColumn("expires_at", "timestamptz", (c) => c.notNull())
    .addColumn("currency", "char(3)", (c) => c.notNull())
    .addColumn("spending_limit", "bigint", (c) => c.notNull().check(sql`spending_limit >= 0`))
    .addColumn("status", "text", (c) =>
      c.notNull().check(sql`status IN ('inactive', 'active', 'frozen', 'closed')`),
    )
    .addColumn("closed_reason", "text", (c) => c.check(sql`closed_reason IN ('lost', 'stolen', 'cancelled')`))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("cards_closed_reason_iff_closed", sql`(status = 'closed') = (closed_reason IS NOT NULL)`)
    .execute();

  await db.schema
    .createIndex("cards_one_open_per_holder")
    .on("cards")
    .columns(["company_id", "holder_user_id"])
    .unique()
    .where(sql<boolean>`status <> 'closed'`)
    .execute();

  await db.schema
    .createTable("transactions")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("card_id", "uuid", (c) => c.notNull().references("cards.id"))
    .addColumn("amount", "bigint", (c) => c.notNull().check(sql`amount > 0`))
    .addColumn("currency", "char(3)", (c) => c.notNull())
    .addColumn("merchant_name", "text", (c) => c.notNull())
    .addColumn("occurred_at", "timestamptz", (c) => c.notNull())
    .addColumn("status", "text", (c) => c.notNull().check(sql`status IN ('pending', 'settled', 'reversed')`))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    CREATE INDEX transactions_card_occurred_idx
    ON transactions (card_id, occurred_at, id) INCLUDE (amount, status)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("transactions").execute();
  await db.schema.dropTable("cards").execute();
}
