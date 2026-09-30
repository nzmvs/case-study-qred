import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildService } from "@qred/service-kit";
import type { Database } from "./db/database.js";
import { cardHandlers } from "./handlers.js";
import { mapCardError } from "./problems.js";

const DEFAULT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../contracts/card-api.yaml");

type AppOptions = {
  db: Database;
  demoUserId: string;
  contractPath?: string;
  logger?: boolean;
};

export function buildApp({ db, demoUserId, contractPath = DEFAULT_CONTRACT, logger = false }: AppOptions) {
  return buildService({ contractPath, serviceHandlers: cardHandlers({ db }), demoUserId, mapError: mapCardError, logger });
}
