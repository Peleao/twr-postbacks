import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';

// Stub da BASE; a change REL substitui este arquivo.
export async function reportRoutes(app: FastifyInstance, _opts: { db: Db }): Promise<void> {
  app.get('/clients/:clientId/report', async (_req, reply) =>
    reply.code(501).send({ error: 'not_implemented' }),
  );
}
