# REL — Relatório de vendas

**Objetivo:** `GET /clients/:clientId/report` devolve o resumo de vendas do cliente, por moeda, status e produto, com filtro de período e plataforma.
**Depende de:** BASE
**Pode rodar em paralelo com:** POST
**Passa pelo ux-ui:** não (só JSON)

## Contratos
Seções "GET /clients/:clientId/report" e "Banco" de `docs/contratos.md`. Só mexe em `src/routes/report.ts`, `src/report/*` e testes. Os testes inserem vendas direto na tabela `sales` (não dependem da POST).

## Pacotes
1. **Autorização e query** — arquivos: `src/routes/report.ts`, `src/report/query.ts` (zod das datas; `to` inclusivo vira `< to + 1 dia`). — testes: sem token, token de outro cliente, cliente inexistente → 401 igual; `from` inválido e `from > to` → 400.
2. **Agregação** — arquivos: `src/report/build.ts`. Agregação em SQL (`group by currency, status` e `group by currency, product_id`), todos os 5 status sempre presentes com zero. — testes: duas moedas não se somam; refund sai de `net_revenue_cents`; filtro de período nas bordas (`from` e `to` inclusivos, UTC); filtro de `platform`; cliente sem vendas → `currencies: []`; vendas de outro cliente não aparecem.

## Critérios de aceite
- [ ] Resposta bate campo a campo com o exemplo do contrato.
- [ ] Um cliente nunca vê dados de outro (teste dedicado).
- [ ] Somas em `bigint` convertidas para `number` sem perda (valores do teste até 10^12).

## Riscos
- `pg` devolve `bigint`/`sum` como string → converter explicitamente e testar o tipo.
- Fuso: datas do filtro em UTC, documentado no README.

## Comandos
```bash
npx vitest run src/report src/routes --reporter=dot --silent
npx tsc --noEmit
```
