import type { FastifyInstance } from 'fastify';
import { checkReadToken } from '../clients.js';
import type { Db } from '../db.js';
import { buildReport } from '../report/build.js';
import { parseReportQuery } from '../report/query.js';

export async function reportRoutes(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  app.get<{ Params: { clientId: string } }>('/clients/:clientId/report', async (req, reply) => {
    const { clientId } = req.params;

    // autenticação antes da query: sem token → 401 mesmo com query inválida
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !(await checkReadToken(opts.db, clientId, token))) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const filters = parseReportQuery(req.query);
    if (!filters) return reply.code(400).send({ error: 'invalid_query' });

    return reply.send(await buildReport(opts.db, clientId, filters));
  });
}
