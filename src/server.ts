import { loadConfig } from './config.js';
import { createPgDb, migrate } from './db.js';
import { buildApp } from './app.js';

const config = loadConfig();
const db = createPgDb(config.DATABASE_URL);
await migrate(db);
const app = buildApp({ db, logger: true });
await app.listen({ port: config.PORT, host: '0.0.0.0' });

// Railway manda SIGTERM ao reimplantar: fecha o servidor e o pool com calma.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}
