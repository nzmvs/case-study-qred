import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("companies")
    .addColumn("id", "uuid", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("memberships")
    .addColumn("user_id", "uuid", (c) => c.notNull().references("users.id"))
    .addColumn("company_id", "uuid", (c) => c.notNull().references("companies.id"))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("memberships_pkey", ["user_id", "company_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("memberships").execute();
  await db.schema.dropTable("companies").execute();
  await db.schema.dropTable("users").execute();
}
