import type { Kysely } from "kysely";
import type { DB } from "./types.js";

export type Database = Kysely<DB>;
