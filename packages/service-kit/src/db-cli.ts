import type { Kysely } from "kysely";
import { createDatabase } from "./database.js";
import { migrateToLatest } from "./migrate.js";

type DbCliOptions<DB> = {
  migrationFolder: string;
  seedIfEmpty: (db: Kysely<DB>) => Promise<void>;
  reseed: (db: Kysely<DB>) => Promise<void>;
};

/** `migrate | seed | reset` against DATABASE_URL. */
export async function runDbCli<DB>({ migrationFolder, seedIfEmpty, reseed }: DbCliOptions<DB>): Promise<void> {
  const commands = {
    migrate: (db: Kysely<DB>) => migrateToLatest(db, migrationFolder),
    seed: seedIfEmpty,
    reset: reseed,
  };
  const command = process.argv[2];
  if (!command || !(command in commands)) {
    console.error(`usage: cli <${Object.keys(commands).join("|")}>`);
    process.exit(2);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const db = createDatabase<DB>(connectionString);
  try {
    await commands[command as keyof typeof commands](db);
    console.log(`db ${command}: done`);
  } finally {
    await db.destroy();
  }
}
