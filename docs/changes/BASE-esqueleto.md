# BASE — Esqueleto do serviço

**Objetivo:** projeto TypeScript rodando com Fastify, banco migrado, `/health` e os módulos de base de `docs/contratos.md`, com as rotas de webhook e relatório em stub (501).
**Depende de:** nada
**Pode rodar em paralelo com:** nada (POST e REL dependem dela)
**Passa pelo ux-ui:** não

## Contratos
Seção "Módulos de base", "Banco" e "GET /health" de `docs/contratos.md`. Exatos.

## Pacotes
1. **Projeto** — arquivos: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/config.ts` (zod: `DATABASE_URL`, `PORT` padrão 3000, `NODE_ENV`), `src/server.ts` (lê config, migra, sobe). Scripts: `dev`, `build`, `start`, `test`, `typecheck`, `client:create`. — testes: `src/config.test.ts` (rejeita `DATABASE_URL` ausente).
2. **Banco** — arquivos: `migrations/001_init.sql`, `src/db.ts`, `test/helpers.ts`. `migrate` guarda as aplicadas em `schema_migrations`. — testes: `src/db.test.ts` (migrar duas vezes não falha; `transaction` faz rollback em erro).
3. **Clientes** — arquivos: `src/clients.ts`, `scripts/create-client.ts` (cria cliente com id/nome; segredo e token por argumento ou gerados com `crypto.randomBytes`; imprime os dois uma vez). — testes: `src/clients.test.ts` (token certo/errado/cliente inexistente).
4. **App** — arquivos: `src/app.ts`, `src/routes/webhooks.ts` (stub 501), `src/routes/report.ts` (stub 501), `src/routes/health.ts`. Logger pino sem logar cabeçalho `authorization` nem `x-twr-signature`. — testes: `src/app.test.ts` (`/health` 200; stubs 501).

## Critérios de aceite
- [ ] `npm test`, `npm run typecheck` e `npm run build` passam.
- [ ] `npm start` com `DATABASE_URL` válido migra e responde `GET /health` 200.
- [ ] `npm run client:create -- --id demo --name Demo` cria o cliente e imprime segredo e token.
- [ ] Assinaturas exportadas idênticas às de `docs/contratos.md`.

## Riscos
- PGlite e `pg` divergirem em algum detalhe → só SQL padrão; `Db` é a única porta para o banco.

## Comandos
```bash
npx vitest run --reporter=dot --silent
npx tsc --noEmit
npm run build --silent
```
