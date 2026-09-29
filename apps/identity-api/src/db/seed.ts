import { sql } from "kysely";
import type { Database } from "./database.js";

// Fixed ids shared with the other services' seeds and the contract examples.
const ANNA = "00000000-0000-4000-a000-000000000001";
const COMPANY_AB = "00000000-0000-4000-a000-000000000101";
const NORDIC_TRADING = "00000000-0000-4000-a000-000000000102";

export async function seedIfEmpty(db: Database): Promise<void> {
  const existing = await db.selectFrom("users").select(db.fn.countAll<number>().as("count")).executeTakeFirstOrThrow();
  if (Number(existing.count) > 0) return;
  await seed(db);
}

export async function reseed(db: Database): Promise<void> {
  await sql`TRUNCATE memberships, companies, users`.execute(db);
  await seed(db);
}

async function seed(db: Database): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await tx.insertInto("users").values({ id: ANNA, name: "Anna Lindqvist" }).execute();
    await tx
      .insertInto("companies")
      .values([
        { id: COMPANY_AB, name: "Company AB" },
        { id: NORDIC_TRADING, name: "Nordic Trading AB" },
      ])
      .execute();
    await tx
      .insertInto("memberships")
      .values([
        { userId: ANNA, companyId: COMPANY_AB },
        { userId: ANNA, companyId: NORDIC_TRADING },
      ])
      .execute();
  });
}
