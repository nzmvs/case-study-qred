import { createDatabase } from "./database.js";
import { migrateToLatest } from "./migrate.js";
import { reseed, seedIfEmpty } from "./seed.js";

const commands = {
  migrate: migrateToLatest,
  seed: seedIfEmpty,
  reset: reseed,
} as const;

const command = process.argv[2] as keyof typeof commands | undefined;
if (!command || !(command in commands)) {
  console.error(`usage: cli <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const db = createDatabase(connectionString);
try {
  await commands[command](db);
  console.log(`db ${command}: done`);
} finally {
  await db.destroy();
}
