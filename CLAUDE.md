# Receptor de Postbacks (desafio TWR)

Serviço TypeScript que recebe webhooks de venda (`POST /webhooks/:clientId`) e devolve relatório (`GET /clients/:clientId/report`).
Contratos fixados em `docs/contratos.md`; changes em `docs/changes/`; quadro em `.claude/quadro.md`.

## Comandos (modo silencioso)

```bash
npx vitest run --reporter=dot --silent   # testes (PGlite, sem Docker)
npx tsc --noEmit                         # tipos
npm run build --silent                   # build
```

## Produção

Azure, grupo `rg-twr-postbacks`: App Service `twr-postbacks-peleao` (East US 2) e Postgres `psql-twr-postbacks-peleao` (North Central US). Deploy: `git archive --format=zip origin/main` + `az webapp deploy --type zip --track-status false`. URL: https://twr-postbacks-peleao.azurewebsites.net. A `DATABASE_URL` mora só nas configurações do App Service.

## Regras do projeto

- Valores em centavos inteiros; datas em UTC.
- Todo acesso ao banco passa por `Db` (`src/db.ts`).
- Nunca logar segredo, token, assinatura ou payload completo.
- A pessoa precisa defender tudo numa entrevista: código simples, sem abstração que não se explica em uma frase.
