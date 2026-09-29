import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildService, type Principals } from "@qred/service-kit";
import type { Database } from "./db/database.js";
import { billingHandlers, type Clock } from "./handlers.js";

const DEFAULT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../contracts/billing-api.yaml");

type AppOptions = { db: Database; principals: Principals; clock?: Clock; contractPath?: string; logger?: boolean };

export function buildApp({ db, principals, clock = () => new Date(), contractPath = DEFAULT_CONTRACT, logger = false }: AppOptions) {
  return buildService({ contractPath, serviceHandlers: billingHandlers({ db, clock }), principals, logger });
}
