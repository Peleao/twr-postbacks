import type { FastifyInstance } from 'fastify';
import { findClient } from '../clients.js';
import type { Db } from '../db.js';
import { ingestEvent } from '../webhooks/ingest.js';
import { parseEvent } from '../webhooks/schema.js';
import { verifySignature } from '../webhooks/signature.js';

const BODY_LIMIT = 64 * 1024;

export async function webhookRoutes(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  // corpo cru: a assinatura vale sobre os bytes recebidos, então não parseamos aqui
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: BODY_LIMIT }, (_req, body, done) =>
    done(null, body),
  );

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send(err);
    app.log.error({ err }, 'falha ao processar webhook');
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.post<{ Params: { clientId: string } }>(
    '/webhooks/:clientId',
    { bodyLimit: BODY_LIMIT },
    async (req, reply) => {
      const client = await findClient(opts.db, req.params.clientId);
      const raw = req.body as Buffer;
      // assinatura antes de parsear o JSON; resposta igual para qualquer falha
      if (!client || !verifySignature(raw, req.headers['x-twr-signature'] as string | undefined, client.webhookSecret)) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }
      const parsed = parseEvent(raw);
      if (!parsed.ok) return reply.code(400).send({ error: 'invalid_payload', details: parsed.details });
      const result = await ingestEvent(opts.db, client.id, parsed.event);
      if (result === 'duplicate') return reply.code(200).send({ status: 'duplicate' });
      if (result === 'stale') return reply.code(200).send({ status: 'processed', applied: false });
      return reply.code(200).send({ status: 'processed' });
    },
  );
}
