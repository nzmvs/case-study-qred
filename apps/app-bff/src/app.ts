import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildService, type Principals } from "@qred/service-kit";
import { bffHandlers, type Clock } from "./handlers.js";
import type { Upstreams } from "./upstreams.js";

const DEFAULT_CONTRACT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../contracts/app-bff.yaml");

type AppOptions = {
  upstreams: Upstreams;
  principals: Principals;
  clock?: Clock;
  timeoutMs?: number;
  contractPath?: string;
  logger?: boolean;
};

export function buildApp({ upstreams, principals, clock = () => new Date(), timeoutMs = 1000, contractPath = DEFAULT_CONTRACT, logger = false }: AppOptions) {
  return buildService({ contractPath, serviceHandlers: bffHandlers({ upstreams, clock, timeoutMs }), principals, logger });
}
