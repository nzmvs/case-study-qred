import fastifyBearerAuth from "@fastify/bearer-auth";
import type { FastifyInstance } from "fastify";

export type Principal =
  | { kind: "user"; userId: string; memberships: string[] }
  | { kind: "client"; clientId: string; scopes: string[] };

export type Principals = Record<string, Principal>;

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal;
  }
}

/**
 * Mocked authentication (ADR 0003): the bearer token is a demo principal name. Replacing this
 * with JWT verification must produce the same Principal and touches nothing else.
 */
export async function registerBearerAuth(app: FastifyInstance, principals: Principals) {
  await app.register(fastifyBearerAuth, {
    keys: [],
    // Verification is called from the service's own onRequest hook, which keeps /health open.
    addHook: false,
    verifyErrorLogLevel: "debug",
    auth: (token, request) => {
      const principal = principals[token];
      if (principal) request.principal = principal;
      return principal !== undefined;
    },
  });
}
