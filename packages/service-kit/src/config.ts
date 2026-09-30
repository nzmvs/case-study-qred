/** Settings every service reads from its environment; each service adds its own. */
export const serviceEnv = {
  PORT: { type: "integer" },
  DEMO_USER_ID: { type: "string", minLength: 1 },
  CONTRACT_PATH: { type: "string" },
} as const;

export const serviceEnvRequired = ["PORT", "DEMO_USER_ID"] as const;

export type ServiceEnv = { PORT: number; DEMO_USER_ID: string; CONTRACT_PATH?: string };
