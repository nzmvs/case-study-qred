import { createDatabase, parsePrincipals, type ServiceEnv, serviceEnv, serviceEnvRequired } from "@qred/service-kit";
import envSchema from "env-schema";
import { buildApp } from "./app.js";
import type { DB } from "./db/types.js";

const config = envSchema<ServiceEnv & { DATABASE_URL: string }>({
  schema: {
    type: "object",
    required: [...serviceEnvRequired, "DATABASE_URL"],
    properties: { ...serviceEnv, DATABASE_URL: { type: "string" } },
  },
});

const app = await buildApp({
  db: createDatabase<DB>(config.DATABASE_URL),
  principals: parsePrincipals(config.AUTH_PRINCIPALS),
  ...(config.CONTRACT_PATH ? { contractPath: config.CONTRACT_PATH } : {}),
  logger: true,
});

await app.listen({ host: "0.0.0.0", port: config.PORT });
