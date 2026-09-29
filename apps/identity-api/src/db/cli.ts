import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDbCli } from "@qred/service-kit";
import { reseed, seedIfEmpty } from "./seed.js";
import type { DB } from "./types.js";

await runDbCli<DB>({
  migrationFolder: path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations"),
  seedIfEmpty,
  reseed,
});
