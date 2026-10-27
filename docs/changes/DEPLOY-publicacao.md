# DEPLOY — Publicação e README

**Objetivo:** aplicação no ar no Azure App Service com Azure Postgres, cliente `demo` criado e README com exemplos, premissas e o que ficou de fora.
**Depende de:** BASE (deploy inicial) · POST e REL (smoke final e README)
**Pode rodar em paralelo com:** POST e REL (a parte de infraestrutura)
**Passa pelo ux-ui:** não

## Contratos
Todos de `docs/contratos.md` (o README documenta exatamente eles).

## Pacotes
1. **Infra** (logo após a BASE) — já criada pela coordenadora na assinatura Azure for Students (East US 2, a política da assinatura bloqueia Brazil South): grupo `rg-twr-postbacks`; App Service Linux B1 `twr-postbacks-peleao` (Node 22, Always On, HTTPS only, startup `npm start`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`); Postgres Flexible B1ms `psql-twr-postbacks-peleao` em North Central US (East US 2 e East US não permitem Postgres nesta assinatura), banco `postbacks`, TLS obrigatório; `DATABASE_URL` já configurada no app (nunca imprimir). Deploy: `az webapp deploy -g rg-twr-postbacks -n twr-postbacks-peleao --type zip --src-path <zip> --track-status false` com o zip gerado por `git archive --format=zip origin/main` (o Oryx roda `npm install` + `npm run build`). Health check do App Service em `/health`. Criar o cliente `demo` com segredo e token de demonstração. — teste: `GET https://twr-postbacks-peleao.azurewebsites.net/health` = 200.
2. **Script de envio** — arquivos: `scripts/send-sample.ts` (`npm run send-sample -- --url <base> --secret <s> --type sale.approved --sale ord_1`): monta o evento, assina e envia. — testes: assinatura gerada bate com `test/helpers.sign`.
3. **README** — arquivo: `README.md`: o que é; como rodar local; exemplo de `POST` (curl + `openssl dgst -sha256 -hmac` e o script); exemplo de `GET`; credenciais do `demo`; premissas e decisões com o porquê; o que decidimos não fazer.
4. **Smoke em produção** — approved → reenvio do mesmo → refunded → relatório mostra 1 venda reembolsada e `net` 0.

## Decisões a registrar no README
- Formato próprio de webhook com `platform` livre; adaptar uma plataforma real = um tradutor para esse formato.
- Vários clientes, segredo por cliente, HMAC sobre o corpo cru; GET com token de leitura (o do `demo` é público de propósito).
- Idempotência por `(client_id, event_id)` no banco; ordem por `occurred_at`.
- Centavos inteiros; moedas não se somam; datas em UTC.
- Não guardamos dados do comprador.
- **Não fizemos:** fila assíncrona (o processamento é uma transação curta; com volume, gravar o evento cru e processar numa fila), proteção contra replay por timestamp na assinatura, rate limit, painel visual, adaptadores de plataformas reais, rotação de segredo, ClickHouse/OpenTelemetry (logs estruturados do pino como base).

## Critérios de aceite
- [ ] URL pública responde `/health`, `POST` e `GET` do README copiados e colados funcionam.
- [ ] Smoke em produção passa.
- [ ] README cobre os três itens pedidos no e-mail.

## Riscos
- Crédito de estudante (~US$13/mês do B1; Postgres B1ms no free tier de 750 h/mês) → manter só esses dois recursos; deploy do esqueleto logo após a BASE para descobrir problema cedo.
- Prazo hoje 23:59 → POST e REL em paralelo; README começa durante elas.

## Comandos
```bash
npx vitest run --reporter=dot --silent
npm run build --silent
curl -fsS https://twr-postbacks-peleao.azurewebsites.net/health
```
