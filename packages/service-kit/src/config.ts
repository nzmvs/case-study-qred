import { Ajv } from "ajv";
import type { Principals } from "./auth.js";

/** Settings every service reads from its environment; each service adds its own. */
export const serviceEnv = {
  PORT: { type: "integer" },
  AUTH_PRINCIPALS: { type: "string" },
  CONTRACT_PATH: { type: "string" },
} as const;

export const serviceEnvRequired = ["PORT", "AUTH_PRINCIPALS"] as const;

export type ServiceEnv = { PORT: number; AUTH_PRINCIPALS: string; CONTRACT_PATH?: string };

const id = { type: "string", minLength: 1 } as const;
const validatePrincipals = new Ajv({ allErrors: true }).compile<Principals>({
  type: "object",
  additionalProperties: {
    oneOf: [
      {
        type: "object",
        required: ["kind", "userId", "memberships"],
        additionalProperties: false,
        properties: { kind: { const: "user" }, userId: id, memberships: { type: "array", items: id } },
      },
      {
        type: "object",
        required: ["kind", "clientId", "scopes"],
        additionalProperties: false,
        properties: { kind: { const: "client" }, clientId: id, scopes: { type: "array", items: id } },
      },
    ],
  },
});

/** The mocked principals (ADR 0003), checked at startup rather than trusted. */
export function parsePrincipals(json: string): Principals {
  const principals: unknown = JSON.parse(json);
  if (!validatePrincipals(principals)) {
    throw new Error(`AUTH_PRINCIPALS is invalid: ${JSON.stringify(validatePrincipals.errors)}`);
  }
  return principals;
}
