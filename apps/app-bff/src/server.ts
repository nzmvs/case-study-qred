import { parsePrincipals } from "@qred/service-kit";
import { buildApp } from "./app.js";
import { createUpstreams } from "./upstreams.js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const app = await buildApp({
  upstreams: createUpstreams({ identity: env("IDENTITY_API_URL"), card: env("CARD_API_URL"), billing: env("BILLING_API_URL") }),
  principals: parsePrincipals(process.env.AUTH_PRINCIPALS),
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 1000),
  ...(process.env.CONTRACT_PATH ? { contractPath: process.env.CONTRACT_PATH } : {}),
  logger: true,
});

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
