import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDbCli } from "@qred/service-kit";
import type { DB } from "./types.js";
import { reseed, seedIfEmpty } from "./seed.js";

await runDbCli<DB>({
  migrationFolder: path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations"),
  seedIfEmpty: (db) => seedIfEmpty(db),
  reseed: (db) => reseed(db),
});
