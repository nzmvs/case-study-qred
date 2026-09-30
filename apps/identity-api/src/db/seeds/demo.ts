import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { DB } from "../types.js";

// Fixed ids shared with the other services' seeds and the contract examples.
const ANNA = "00000000-0000-4000-a000-000000000001";
const COMPANY_AB = "00000000-0000-4000-a000-000000000101";
const NORDIC_TRADING = "00000000-0000-4000-a000-000000000102";

/** kysely-ctl seed: resets this service's demo data on every run. */
export async function seed(db: Kysely<DB>): Promise<void> {
  await sql`TRUNCATE memberships, companies, users`.execute(db);
  await insertDemoData(db);
}

async function insertDemoData(db: Kysely<DB>): Promise<void> {
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
