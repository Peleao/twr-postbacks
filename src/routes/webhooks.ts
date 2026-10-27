import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';

// Stub da BASE; a change POST substitui este arquivo.
export async function webhookRoutes(app: FastifyInstance, _opts: { db: Db }): Promise<void> {
  app.post('/webhooks/:clientId', async (_req, reply) =>
    reply.code(501).send({ error: 'not_implemented' }),
  );
}
