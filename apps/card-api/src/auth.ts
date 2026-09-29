import type { FastifyRequest } from "fastify";

export type Principal =
  | { kind: "user"; userId: string; memberships: string[] }
  | { kind: "client"; clientId: string; scopes: string[] };

export type Principals = Record<string, Principal>;

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal;
  }
}

export class Unauthenticated extends Error {
  readonly statusCode = 401;
}

/**
 * Mocked authentication (ADR 0003): the bearer token is a demo principal name. Replacing this
 * with JWT verification must produce the same Principal and touches nothing else.
 */
export function bearerAuth(principals: Principals) {
  return async (request: FastifyRequest) => {
    const [scheme, token] = (request.headers.authorization ?? "").split(" ");
    const principal = scheme === "Bearer" && token ? principals[token] : undefined;
    if (!principal) throw new Unauthenticated("Unknown principal.");
    request.principal = principal;
  };
}

export function parsePrincipals(json: string | undefined): Principals {
  if (!json) throw new Error("AUTH_PRINCIPALS is not set");
  return JSON.parse(json) as Principals;
}
