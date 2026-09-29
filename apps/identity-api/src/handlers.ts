import type { FastifyRequest } from "fastify";
import { httpErrors } from "@qred/service-kit";
import type { Database } from "./db/database.js";
import type { components } from "./generated/identity-api.js";

type Me = components["schemas"]["Me"];

export function identityHandlers({ db }: { db: Database }) {
  return {
    async getMe(request: FastifyRequest): Promise<Me> {
      const { principal } = request;
      if (principal.kind !== "user") throw httpErrors.forbidden("Only a User has a /me.");

      const user = await db.selectFrom("users").select(["id", "name"]).where("id", "=", principal.userId).executeTakeFirst();
      if (!user) throw httpErrors.unauthorized("The principal's User does not exist.");

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
