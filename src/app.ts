import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db.js';
import { healthRoutes } from './routes/health.js';
import { reportRoutes } from './routes/report.js';
import { webhookRoutes } from './routes/webhooks.js';

export function buildApp(deps: { db: Db; logger?: boolean }): FastifyInstance {
  // segredos nunca vão para o log
  const app = Fastify({
    logger: deps.logger
      ? { redact: ['req.headers.authorization', 'req.headers["x-twr-signature"]'] }
      : false,
  });
  app.register(healthRoutes, { db: deps.db });
  app.register(webhookRoutes, { db: deps.db });
  app.register(reportRoutes, { db: deps.db });
  return app;
}
