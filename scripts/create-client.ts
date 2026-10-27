import { parseArgs } from 'node:util';
import { createClient } from '../src/clients.js';
import { loadConfig } from '../src/config.js';
import { createPgDb, migrate } from '../src/db.js';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    name: { type: 'string' },
    secret: { type: 'string' },
    token: { type: 'string' },
  },
});

if (!values.id || !values.name) {
  console.error('Uso: npm run client:create -- --id <id> --name <nome> [--secret <s>] [--token <t>]');
  process.exitCode = 1;
} else {
  const db = createPgDb(loadConfig().DATABASE_URL);
  try {
    await migrate(db);
    const c = await createClient(db, {
      id: values.id,
      name: values.name,
      secret: values.secret,
      token: values.token,
    });
    console.log(`Cliente criado: ${c.id}`);
    console.log(`WEBHOOK_SECRET=${c.secret}`);
    console.log(`READ_TOKEN=${c.token}`);
    console.log('Guarde agora: o token não pode ser recuperado depois (só o hash fica no banco).');
  } finally {
    await db.close();
  }
}
