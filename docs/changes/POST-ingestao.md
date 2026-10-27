# POST — Ingestão de webhooks

**Objetivo:** `POST /webhooks/:clientId` recebe, autentica, valida e grava eventos de venda de forma idempotente e tolerante a fora de ordem.
**Depende de:** BASE
**Pode rodar em paralelo com:** REL
**Passa pelo ux-ui:** não

## Contratos
Seções "POST /webhooks/:clientId" e "Banco" de `docs/contratos.md`. Só mexe em `src/routes/webhooks.ts`, `src/webhooks/*` e testes.

## Pacotes
1. **Assinatura e corpo cru** — arquivos: `src/routes/webhooks.ts`, `src/webhooks/signature.ts`. Parser de JSON do plugin guarda o corpo cru (`addContentTypeParser` com `parseAs: 'buffer'`); HMAC sobre os bytes recebidos, comparação com `timingSafeEqual`; `bodyLimit` 64 KB. — testes: `src/webhooks/signature.test.ts`, rota: sem cabeçalho, assinatura errada, cliente inexistente → 401 igual; corpo grande → 413.
2. **Validação** — arquivos: `src/webhooks/schema.ts` (zod, `.passthrough()` no topo). — testes: campos faltando, `amount_cents` negativo/fracionado, `currency` fora de 3 letras maiúsculas, `occurred_at` não ISO, `event_type` desconhecido → 400 com `details`.
3. **Gravação** — arquivos: `src/webhooks/ingest.ts`. Numa transação: `insert ... on conflict (client_id, event_id) do nothing returning id`; se não inseriu → `duplicate`. Senão upsert da venda com a regra de ordem (`sold_at` = menor `occurred_at` visto). — testes: approved → refunded; refunded chegando antes do approved (fica refunded); mesmo `event_id` duas vezes (1 linha, `duplicate`); mesmo `event_id` em clientes diferentes (2 linhas); 20 envios concorrentes do mesmo evento (1 linha).

## Critérios de aceite
- [ ] Cada linha da tabela de respostas do contrato tem um teste de rota.
- [ ] Reenvio do mesmo evento não altera totais.
- [ ] Evento antigo não sobrescreve status mais novo.
- [ ] Nenhum log contém o segredo, a assinatura ou o payload completo.

## Riscos
- Assinatura calculada sobre o JSON re-serializado (falha com plataformas reais) → HMAC sempre sobre o buffer cru; teste com espaços e ordem de chaves diferente.
- Corrida entre reenvios simultâneos → unicidade no banco, não checagem prévia em código.

## Comandos
```bash
npx vitest run src/webhooks src/routes --reporter=dot --silent
npx tsc --noEmit
```
