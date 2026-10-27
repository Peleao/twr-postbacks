import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';

export async function healthRoutes(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  app.get('/health', async (_req, reply) => {
    try {
      await opts.db.query('select 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
