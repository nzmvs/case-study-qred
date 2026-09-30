import { CamelCasePlugin, PostgresDialect } from "kysely";
import { defineConfig } from "kysely-ctl";
import pg from "pg";

/**
 * Shared kysely-ctl setup: each service keeps its migrations and seeds under src/db. Exported as
 * `@qred/service-kit/kysely-config` straight from source, since kysely-ctl loads it with jiti.
 */
export const kyselyConfig = () =>
  defineConfig({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }) }),
    plugins: [new CamelCasePlugin()],
    migrations: { migrationFolder: "src/db/migrations" },
    seeds: { seedFolder: "src/db/seeds" },
  });
