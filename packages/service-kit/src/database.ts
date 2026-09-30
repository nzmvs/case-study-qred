import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

// Money is stored as bigint minor units; öre amounts stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
// Calendar dates stay "YYYY-MM-DD"; parsing them into Date would attach a time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export function createDatabase<DB>(connectionString: string): Kysely<DB> {
  const pool = new pg.Pool({ connectionString });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] });
}
