import { parsePrincipals, type ServiceEnv, serviceEnv, serviceEnvRequired } from "@qred/service-kit";
import envSchema from "env-schema";
import { initialize } from "unleash-client";
import { buildApp } from "./app.js";
import { type SourceFlags, unleashFlags } from "./sources.js";
import { createUpstreams } from "./upstreams.js";

type Config = ServiceEnv & {
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
};

const url = { type: "string", minLength: 1 } as const;
const config = envSchema<Config>({
  schema: {
    type: "object",
    required: [...serviceEnvRequired, "IDENTITY_API_URL", "CARD_API_URL", "BILLING_API_URL"],
    properties: {
      ...serviceEnv,
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
    if: { properties: { UPSTREAM_MOCKS_ALLOWED: { const: true } } },
    then: { required: ["IDENTITY_API_MOCK_URL", "CARD_API_MOCK_URL", "BILLING_API_MOCK_URL"] },
    dependencies: { UNLEASH_URL: ["UNLEASH_TOKEN"] },
  },
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

const app = await buildApp({
  routing: {
    real: createUpstreams({ identity: config.IDENTITY_API_URL, card: config.CARD_API_URL, billing: config.BILLING_API_URL }),
    mock: config.UPSTREAM_MOCKS_ALLOWED
      ? createUpstreams({
          identity: config.IDENTITY_API_MOCK_URL!,
          card: config.CARD_API_MOCK_URL!,
          billing: config.BILLING_API_MOCK_URL!,
        })
      : null,
    flags,
  },
  principals: parsePrincipals(config.AUTH_PRINCIPALS),
  timeoutMs: config.UPSTREAM_TIMEOUT_MS,
  ...(config.CONTRACT_PATH ? { contractPath: config.CONTRACT_PATH } : {}),
  logger: true,
});
app.addHook("onClose", async () => unleash?.destroy());

await app.listen({ host: "0.0.0.0", port: config.PORT });
