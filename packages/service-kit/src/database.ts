import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

// Money is stored as bigint minor units; öre amounts stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export function createDatabase<DB>(connectionString: string, searchPath?: string): Kysely<DB> {
  const pool = new pg.Pool({
    connectionString,
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {}),
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] });
}
