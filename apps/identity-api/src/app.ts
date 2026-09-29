import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildService, type Principals } from "@qred/service-kit";
import type { Database } from "./db/database.js";
import { identityHandlers } from "./handlers.js";

const DEFAULT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../contracts/identity-api.yaml");

type AppOptions = { db: Database; principals: Principals; contractPath?: string; logger?: boolean };

export function buildApp({ db, principals, contractPath = DEFAULT_CONTRACT, logger = false }: AppOptions) {
  return buildService({ contractPath, serviceHandlers: identityHandlers({ db }), principals, logger });
}
