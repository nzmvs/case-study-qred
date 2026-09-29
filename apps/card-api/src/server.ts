import { buildApp } from "./app.js";
import { parsePrincipals } from "./auth.js";
import { createDatabase } from "./db/database.js";

const port = Number(process.env.PORT ?? 3002);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const app = await buildApp({
  db: createDatabase(databaseUrl),
  principals: parsePrincipals(process.env.AUTH_PRINCIPALS),
  ...(process.env.CONTRACT_PATH ? { contractPath: process.env.CONTRACT_PATH } : {}),
  logger: true,
});

await app.listen({ host: "0.0.0.0", port });
