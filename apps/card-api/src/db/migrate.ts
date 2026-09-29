import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";

export async function migrateToLatest(db: Kysely<any>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations"),
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === "Error") console.error(`migration ${result.migrationName} failed`);
  }
  if (error) throw error;
}
