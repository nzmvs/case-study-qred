import { contract, contractPath, createService, demoIdentity, loadServiceConfig, problemJson } from "@qred/service-kit";
import { initialize } from "unleash-client";
import { bffHandlers } from "./handlers.js";
import { type SourceFlags, unleashFlags } from "./sources.js";
import { createUpstreams } from "./upstreams.js";

const url = { type: "string", minLength: 1 } as const;
const config = loadServiceConfig<{
  IDENTITY_API_URL: string;
  CARD_API_URL: string;
  BILLING_API_URL: string;
  UPSTREAM_TIMEOUT_MS: number;
  UPSTREAM_MOCKS_ALLOWED: boolean;
  IDENTITY_API_MOCK_URL?: string;
  CARD_API_MOCK_URL?: string;
  BILLING_API_MOCK_URL?: string;
  UNLEASH_URL?: string;
  UNLEASH_TOKEN?: string;
  UNLEASH_REFRESH_MS: number;
}>({
  properties: {
    IDENTITY_API_URL: url,
    CARD_API_URL: url,
    BILLING_API_URL: url,
    UPSTREAM_TIMEOUT_MS: { type: "integer", default: 1000 },
    // Mock clients are only created where the environment allows them; production never sets this.
    UPSTREAM_MOCKS_ALLOWED: { type: "boolean", default: false },
    IDENTITY_API_MOCK_URL: url,
    CARD_API_MOCK_URL: url,
    BILLING_API_MOCK_URL: url,
    UNLEASH_URL: url,
    UNLEASH_TOKEN: { type: "string", minLength: 1 },
    UNLEASH_REFRESH_MS: { type: "integer", default: 15_000 },
  },
  required: ["IDENTITY_API_URL", "CARD_API_URL", "BILLING_API_URL"],
  if: { properties: { UPSTREAM_MOCKS_ALLOWED: { const: true } } },
  then: { required: ["IDENTITY_API_MOCK_URL", "CARD_API_MOCK_URL", "BILLING_API_MOCK_URL"] },
  dependencies: { UNLEASH_URL: ["UNLEASH_TOKEN"] },
});

const unleash = config.UNLEASH_URL
  ? initialize({
      url: config.UNLEASH_URL,
      appName: "app-bff",
      customHeaders: { Authorization: config.UNLEASH_TOKEN! },
      refreshInterval: config.UNLEASH_REFRESH_MS,
    })
  : undefined;
const flags: SourceFlags | null = unleash ? unleashFlags(unleash) : null;

const routing = {
  real: createUpstreams({ identity: config.IDENTITY_API_URL, card: config.CARD_API_URL, billing: config.BILLING_API_URL }),
  mock: config.UPSTREAM_MOCKS_ALLOWED
    ? createUpstreams({
        identity: config.IDENTITY_API_MOCK_URL!,
        card: config.CARD_API_MOCK_URL!,
        billing: config.BILLING_API_MOCK_URL!,
      })
    : null,
  flags,
};

// The request pipeline, in order: errors as problem+json, who is asking, then the contract's routes.
const app = createService();
await app.register(problemJson);
await app.register(demoIdentity, { userId: config.DEMO_USER_ID });
await app.register(contract, {
  path: config.CONTRACT_PATH ?? contractPath("app-bff"),
  handlers: bffHandlers({ routing, timeoutMs: config.UPSTREAM_TIMEOUT_MS }),
});
app.addHook("onClose", async () => unleash?.destroy());

await app.listen({ host: "0.0.0.0", port: config.PORT });
