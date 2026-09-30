import envSchema from "env-schema";

export type ServiceEnv = { PORT: number; DEMO_USER_ID: string; CONTRACT_PATH?: string };

type Schema = { properties?: Record<string, object>; required?: readonly string[]; [keyword: string]: unknown };

export function loadServiceConfig<Own extends object = object>({ properties = {}, required = [], ...keywords }: Schema = {}) {
  return envSchema<ServiceEnv & Own>({
    schema: {
      type: "object",
      required: ["PORT", "DEMO_USER_ID", ...required],
      properties: {
        PORT: { type: "integer" },
        DEMO_USER_ID: { type: "string", minLength: 1 },
        CONTRACT_PATH: { type: "string" },
        ...properties,
      },
      ...keywords,
    },
  });
}
