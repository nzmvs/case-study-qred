import { contract, contractPath, createDatabase, createService, demoIdentity, loadServiceConfig, problemJson } from "@qred/service-kit";
import type { DB } from "./db/types.js";
import { billingHandlers } from "./handlers.js";

const config = loadServiceConfig<{ DATABASE_URL: string }>({
  properties: { DATABASE_URL: { type: "string" } },
  required: ["DATABASE_URL"],
});
const db = createDatabase<DB>(config.DATABASE_URL);

const app = createService();
await app.register(problemJson);
await app.register(demoIdentity, { userId: config.DEMO_USER_ID });
await app.register(contract, { path: config.CONTRACT_PATH ?? contractPath("billing-api"), handlers: billingHandlers({ db }) });

await app.listen({ host: "0.0.0.0", port: config.PORT });
