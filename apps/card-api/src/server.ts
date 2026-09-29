import { createDatabase, parsePrincipals } from "@qred/service-kit";
import { buildApp } from "./app.js";
import type { DB } from "./db/types.js";

const port = Number(process.env.PORT ?? 3002);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const app = await buildApp({
  db: createDatabase<DB>(databaseUrl),
  principals: parsePrincipals(process.env.AUTH_PRINCIPALS),
  ...(process.env.CONTRACT_PATH ? { contractPath: process.env.CONTRACT_PATH } : {}),
  logger: true,
});

await app.listen({ host: "0.0.0.0", port });
