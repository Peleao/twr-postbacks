# Receptor de Postbacks — Desafio TWR

Serviço em TypeScript que recebe webhooks de venda de plataformas de checkout (`POST`) e devolve um relatório das vendas de cada cliente (`GET`).

**URL pública:** https://twr-postbacks-peleao.azurewebsites.net

## Como chamar

Existe um cliente de demonstração. As credenciais dele são públicas de propósito, para a avaliação:

| | |
|---|---|
| Cliente | `demo` |
| Segredo do webhook (HMAC) | `twr-demo-secret` |
| Token de leitura do relatório | `twr-demo-read-token` |

### POST — enviar uma venda

A plataforma assina o corpo com HMAC-SHA256 usando o segredo do cliente e manda a assinatura no cabeçalho `X-TWR-Signature`. Este exemplo funciona copiando e colando no bash (Linux, macOS ou Git Bash):

```bash
BASE=https://twr-postbacks-peleao.azurewebsites.net
SECRET=twr-demo-secret
BODY='{"event_id":"evt_readme_1","event_type":"sale.approved","occurred_at":"2026-10-27T14:03:00Z","platform":"kiwify","sale":{"id":"ord_readme_1","amount_cents":19790,"currency":"BRL","product":{"id":"curso-ts","name":"Curso de TypeScript"}}}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"

curl -i -X POST "$BASE/webhooks/demo" \
  -H 'Content-Type: application/json' \
  -H "X-TWR-Signature: $SIG" \
  --data "$BODY"
```

A resposta é `{"status":"processed"}`. Rodando o mesmo comando de novo, a resposta é `{"status":"duplicate"}` e a venda não conta duas vezes. Para mandar o reembolso dessa venda, troque `event_id` por `evt_readme_2`, `event_type` por `sale.refunded` e `occurred_at` por um horário mais novo.

O mesmo envio pelo script do repositório, que monta o evento e assina (rode `npm install` antes):

```bash
npm run send-sample -- --url https://twr-postbacks-peleao.azurewebsites.net --client demo --secret twr-demo-secret --type sale.approved --sale ord_42
```

### GET — relatório

```bash
curl -s "https://twr-postbacks-peleao.azurewebsites.net/clients/demo/report?from=2026-10-01&to=2026-10-31" \
  -H 'Authorization: Bearer twr-demo-read-token'
```

Filtros opcionais: `from` e `to` (`YYYY-MM-DD`, inclusivos, em **UTC**, aplicados à data da venda) e `platform`. O relatório vem separado por moeda e traz:
- contagem e valor de cada status (`pending`, `approved`, `canceled`, `refunded`, `chargeback`);
- `net_revenue_cents`, a soma das vendas cujo status atual é `approved`;
- a lista de produtos, ordenada pela receita.

Também existe `GET /health`, que confere o banco.

### Respostas do POST

| Situação | Resposta |
|---|---|
| Evento processado | `200 {"status":"processed"}` |
| `event_id` já recebido | `200 {"status":"duplicate"}` |
| Evento mais antigo que o status atual da venda | `200 {"status":"processed","applied":false}` |
| Assinatura ausente ou errada, ou cliente inexistente | `401 {"error":"invalid_signature"}` |
| JSON inválido ou fora do formato | `400 {"error":"invalid_payload","details":[...]}` |
| Corpo maior que 64 KB | `413` |
| Erro interno | `500 {"error":"internal_error"}` |

### Formato do evento

```json
{
  "event_id": "evt_123",
  "event_type": "sale.approved | sale.pending | sale.canceled | sale.refunded | sale.chargeback",
  "occurred_at": "2026-10-27T14:03:00Z",
  "platform": "kiwify",
  "sale": {
    "id": "ord_123",
    "amount_cents": 19790,
    "currency": "BRL",
    "product": { "id": "curso-ts", "name": "Curso de TypeScript" }
  }
}
```

O contrato completo, com o esquema do banco, está em [`docs/contratos.md`](docs/contratos.md).

## Premissas e decisões

- **Formato próprio de evento.** Cada plataforma real (Hotmart, Kiwify, Eduzz…) tem o seu formato. Defini um formato normalizado e documentado. Integrar uma plataforma real vira escrever um tradutor do formato dela para este, sem mexer no resto. `platform` é texto livre.
- **Vários clientes, cada um com seu segredo.** O webhook entra em `/webhooks/:clientId` e a assinatura HMAC usa o segredo daquele cliente. Assim uma plataforma não consegue gravar vendas em nome de outro cliente. Cliente inexistente e assinatura errada recebem a mesma resposta, para não revelar quais clientes existem.
- **HMAC sobre o corpo exato recebido.** A assinatura é conferida sobre os bytes que chegaram, antes de interpretar o JSON. Se o JSON fosse re-serializado, mudanças de espaço ou de ordem das chaves quebrariam a assinatura.
- **Reenvios são esperados (idempotência).** Plataformas reenviam quando não recebem 2xx a tempo. O banco tem uma restrição única em `(cliente, event_id)`, então o mesmo evento é gravado uma vez só, mesmo com reenvios simultâneos. O reenvio recebe `200 duplicate` para a plataforma parar de tentar.
- **Eventos podem chegar fora de ordem.** O status da venda segue o evento com `occurred_at` mais recente. Um `approved` atrasado não desfaz um `refunded` que já chegou. Se dois eventos têm o mesmo horário, vale o status "mais final" (`pending < approved < canceled < refunded < chargeback`). Todo evento fica guardado, mesmo quando não muda a venda.
- **Evento e venda na mesma transação.** Ou os dois são gravados, ou nenhum é. Em erro, a resposta é 500 e a plataforma reenvia.
- **Dinheiro em centavos inteiros.** Assim não há erro de arredondamento de ponto flutuante. Moedas diferentes nunca se somam.
- **Datas em UTC**, inclusive nos filtros do relatório.
- **Relatório protegido por token.** Dados de venda são sensíveis. Cada cliente tem um token de leitura, e o banco guarda só o hash dele.
- **Comprador.** O serviço não extrai nem usa dados do comprador. O evento é guardado inteiro (`payload`), para auditoria e reprocessamento. Se uma plataforma mandar dados pessoais, eles ficam nesse JSON. O próximo ajuste seria filtrar o payload antes de gravar.
- **Logs** estruturados (pino), sem segredo, token, assinatura nem o payload.

## O que decidi não fazer

- **Fila assíncrona.** Hoje o processamento é uma transação curta dentro da requisição. Com volume alto, o caminho seria gravar o evento cru, responder 200 e processar numa fila com novas tentativas.
- **Proteção contra replay por timestamp na assinatura.** A idempotência por `event_id` já impede que um reenvio conte duas vezes.
- **Rate limit, rotação de segredo e painel para cadastrar clientes.** Hoje clientes são criados por script (`npm run client:create`).
- **Adaptadores de plataformas reais.**
- **Painel visual.** O relatório é JSON.
- **ClickHouse e OpenTelemetry.** Para o volume do desafio, Postgres com agregação em SQL basta. Os logs estruturados são a base para observabilidade.

## Rodar localmente

Requisitos: Node 22 e um Postgres.

```bash
cp .env.example .env    # ajuste DATABASE_URL
npm install
npm run build
npm start               # migra o banco e sobe na porta 3000
npm run client:create -- --id meu-cliente --name "Meu Cliente"   # imprime segredo e token
```

Testes: os testes de banco usam PGlite, um Postgres em memória, então não precisa de Docker.

```bash
npm test
npm run typecheck
```

## Infraestrutura

- Azure App Service Linux (Node 22, plano B1, Always On, só HTTPS) e Azure Database for PostgreSQL Flexible Server (B1ms, TLS obrigatório).
- Deploy por zip do `main` (`az webapp deploy`). O build roda no próprio App Service.
- As migrações rodam na subida do app. O cliente `demo` é criado a partir de `DEMO_CLIENT_ID`, `DEMO_CLIENT_NAME`, `DEMO_WEBHOOK_SECRET` e `DEMO_READ_TOKEN` (ver `.env.example`), se ainda não existir.

## Como o trabalho foi feito

Usei o Claude Code como apoio. O planejamento, com contratos, fatias e critérios, está em [`docs/`](docs/). Cada parte entrou por um PR com testes.
