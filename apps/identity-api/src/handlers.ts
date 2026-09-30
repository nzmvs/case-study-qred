import type { FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { DB } from "./db/types.js";
import type { components } from "./generated/identity-api.js";

type Me = components["schemas"]["Me"];

export function identityHandlers({ db }: { db: Kysely<DB> }) {
  return {
    async getMe(request: FastifyRequest): Promise<Me> {
      const user = await db.selectFrom("users").select(["id", "name"]).where("id", "=", request.userId).executeTakeFirstOrThrow();

      const companies = await db
        .selectFrom("memberships")
        .innerJoin("companies", "companies.id", "memberships.companyId")
        .select(["companies.id", "companies.name"])
        .where("memberships.userId", "=", user.id)
        .orderBy("companies.name")
        .execute();
      return { id: user.id, name: user.name, companies };
    },
  };
}
