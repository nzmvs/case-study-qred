import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export function createDatabase<DB>(connectionString: string): Kysely<DB> {
  const pool = new pg.Pool({ connectionString });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] });
}
