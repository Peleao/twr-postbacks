import type { FastifyInstance } from 'fastify';
import type { Db } from '../db.js';

export async function healthRoutes(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  // quem abre a URL no navegador vê o que o serviço faz, em vez de um 404
  app.get('/', async () => ({
    service: 'twr-postbacks',
    description: 'Recebe webhooks de venda de plataformas de checkout e devolve relatório por cliente.',
    routes: {
      webhook: 'POST /webhooks/:clientId',
      report: 'GET /clients/:clientId/report',
      health: 'GET /health',
    },
    docs: 'https://github.com/Peleao/twr-postbacks#readme',
  }));

  app.get('/health', async (_req, reply) => {
    try {
      await opts.db.query('select 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
