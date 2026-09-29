import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildService, type Principals } from "@qred/service-kit";
import { bffHandlers, type Clock } from "./handlers.js";
import type { Routing } from "./sources.js";

const DEFAULT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../contracts/app-bff.yaml");

type AppOptions = {
  routing: Routing;
  principals: Principals;
  clock?: Clock;
  timeoutMs?: number;
  contractPath?: string;
  logger?: boolean;
};

export function buildApp({ routing, principals, clock = () => new Date(), timeoutMs = 1000, contractPath = DEFAULT_CONTRACT, logger = false }: AppOptions) {
  return buildService({ contractPath, serviceHandlers: bffHandlers({ routing, clock, timeoutMs }), principals, logger });
}
