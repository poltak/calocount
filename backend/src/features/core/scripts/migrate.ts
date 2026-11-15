import { migrations } from "../database/migrations.js";
import { readDatabaseUrl, readLiveConfig } from "../live/config.js";
import { createApp } from "../live/index.js";

try {
  const config = readLiveConfig();
  const databaseUrl = readDatabaseUrl();
  const target = new URL(databaseUrl);
  console.log(
    `Migrating database "${target.pathname.slice(1)}" on ${target.host}`,
  );

  const app = createApp({ config, databaseUrl });
  try {
    const applied = await app.logic.migration.migrate({ migrations });
    console.log(
      applied.length > 0
        ? `Applied ${applied.length} migration(s):\n${applied.map((name) => `  ${name}`).join("\n")}`
        : "The database schema is up to date",
    );
  } finally {
    await app.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
}
