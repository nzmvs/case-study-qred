import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types.js";

// Money is stored as bigint minor units; öre amounts stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export type Database = Kysely<DB>;

export function createDatabase(connectionString: string, searchPath?: string): Database {
  const pool = new pg.Pool({
    connectionString,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {}),
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] });
}
