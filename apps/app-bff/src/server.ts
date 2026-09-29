import { parsePrincipals } from "@qred/service-kit";
import { initialize } from "unleash-client";
import { buildApp } from "./app.js";
import { type SourceFlags, unleashFlags } from "./sources.js";
import { createUpstreams } from "./upstreams.js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Mock clients are only created where the environment allows them; production never sets this.
const mocksAllowed = process.env.UPSTREAM_MOCKS_ALLOWED === "true";

const unleash = process.env.UNLEASH_URL
  ? initialize({
      url: process.env.UNLEASH_URL,
      appName: "app-bff",
      customHeaders: { Authorization: env("UNLEASH_TOKEN") },
      refreshInterval: Number(process.env.UNLEASH_REFRESH_MS ?? 15_000),
    })
  : undefined;
const flags: SourceFlags | null = unleash ? unleashFlags(unleash) : null;

const app = await buildApp({
  routing: {
    real: createUpstreams({ identity: env("IDENTITY_API_URL"), card: env("CARD_API_URL"), billing: env("BILLING_API_URL") }),
    mock: mocksAllowed
      ? createUpstreams({
          identity: env("IDENTITY_API_MOCK_URL"),
          card: env("CARD_API_MOCK_URL"),
          billing: env("BILLING_API_MOCK_URL"),
        })
      : null,
    flags,
  },
  principals: parsePrincipals(process.env.AUTH_PRINCIPALS),
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 1000),
  ...(process.env.CONTRACT_PATH ? { contractPath: process.env.CONTRACT_PATH } : {}),
  logger: true,
});
app.addHook("onClose", async () => unleash?.destroy());

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
