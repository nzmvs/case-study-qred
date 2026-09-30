import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // listCards filters statuses after reading (expired is derived), so the partial unique index never applies.
  await db.schema
    .createIndex("cards_company_holder_idx")
    .on("cards")
    .columns(["company_id", "holder_user_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("cards_company_holder_idx").execute();
}
