import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildService } from "@qred/service-kit";
import { bffHandlers } from "./handlers.js";
import type { Routing } from "./sources.js";

const DEFAULT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../contracts/app-bff.yaml");

type AppOptions = {
  routing: Routing;
  demoUserId: string;
  timeoutMs?: number;
  contractPath?: string;
  logger?: boolean;
};

export function buildApp({ routing, demoUserId, timeoutMs = 1000, contractPath = DEFAULT_CONTRACT, logger = false }: AppOptions) {
  return buildService({ contractPath, serviceHandlers: bffHandlers({ routing, timeoutMs }), demoUserId, logger });
}
