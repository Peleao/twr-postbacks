# Contratos compartilhados — Receptor de Postbacks

Fixados no planejamento. Mudar qualquer item aqui exige avisar a coordenadora antes.

## Stack

- Node 22 LTS, TypeScript (strict), ESM.
- Fastify 5, zod para validação, `pg` em produção.
- Testes: vitest + `@electric-sql/pglite` (Postgres real em WASM, sem Docker).
- Produção: Azure App Service (Linux, Node 22) + Azure Postgres Flexible (app em East US 2, banco em North Central US). Servidor escuta em `0.0.0.0:$PORT`.
- Valores sempre em **centavos inteiros**. Datas em ISO 8601 UTC.

## Banco (migração `migrations/001_init.sql`)

```sql
create table clients (
  id               text primary key,          -- ex.: 'demo'
  name             text not null,
  webhook_secret   text not null,             -- usado no HMAC; precisa ficar em claro
  read_token_hash  text not null,             -- sha256 hex do token de leitura
  created_at       timestamptz not null default now()
);

create table webhook_events (
  id            bigserial primary key,
  client_id     text not null references clients(id),
  event_id      text not null,
  event_type    text not null,
  sale_id       text not null,
  platform      text not null,
  occurred_at   timestamptz not null,
  received_at   timestamptz not null default now(),
  payload       jsonb not null,
  unique (client_id, event_id)
);

create table sales (
  client_id      text not null references clients(id),
  platform       text not null,
  sale_id        text not null,                -- id da venda na plataforma
  product_id     text not null,
  product_name   text not null,
  amount_cents   bigint not null check (amount_cents >= 0),
  currency       char(3) not null,
  status         text not null,                -- pending | approved | canceled | refunded | chargeback
  sold_at        timestamptz not null,          -- occurred_at do primeiro evento recebido
  last_event_at  timestamptz not null,          -- occurred_at do evento que definiu o status
  updated_at     timestamptz not null default now(),
  primary key (client_id, platform, sale_id)
);
create index sales_report_idx on sales (client_id, sold_at);
```

## Módulos de base (entregues pela BASE, usados por POST e REL)

```ts
// src/db.ts
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}
export function createPgDb(databaseUrl: string): Db & { close(): Promise<void> };
export async function migrate(db: Db): Promise<void>;        // roda migrations/*.sql em ordem

// test/helpers.ts
export async function createTestDb(): Promise<Db>;           // PGlite em memória já migrado
export async function seedClient(db: Db, c?: Partial<{ id: string; secret: string; readToken: string }>):
  Promise<{ id: string; secret: string; readToken: string }>; // padrão: 'demo' / 'test-secret' / 'test-token'
export function sign(body: string, secret: string): string;  // 'sha256=<hex>'

// src/clients.ts
export type Client = { id: string; name: string; webhookSecret: string };
export async function findClient(db: Db, id: string): Promise<Client | null>;
export async function checkReadToken(db: Db, clientId: string, token: string): Promise<boolean>; // timingSafeEqual
export function hashToken(token: string): string;            // sha256 hex

// src/app.ts
export function buildApp(deps: { db: Db; logger?: boolean }): FastifyInstance;
// registra: GET /health, webhookRoutes (src/routes/webhooks.ts), reportRoutes (src/routes/report.ts)
// BASE entrega os dois plugins como stub que respondem 501.
```

Cada change mexe só no seu plugin de rota e nos seus testes; `src/app.ts` não muda depois da BASE.

## POST /webhooks/:clientId

Cabeçalhos: `Content-Type: application/json`, `X-TWR-Signature: sha256=<hex HMAC-SHA256(corpo cru, webhook_secret do cliente)>`.

```json
{
  "event_id": "evt_01J9...",
  "event_type": "sale.approved",
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

- `event_type` ∈ `sale.pending | sale.approved | sale.canceled | sale.refunded | sale.chargeback` → status sem o prefixo.
- Campos desconhecidos são aceitos e guardados no `payload` (plataformas evoluem o formato).
- Dados do comprador não são aceitos como campo do contrato nem extraídos (não guardamos PII que o relatório não usa).

| Situação | Resposta |
|---|---|
| Processado | `200 {"status":"processed"}` |
| `event_id` já visto | `200 {"status":"duplicate"}` (a plataforma para de reenviar) |
| Evento mais antigo que o status atual | `200 {"status":"processed","applied":false}` — guardado, não muda a venda |
| Cliente inexistente ou assinatura inválida/ausente | `401 {"error":"invalid_signature"}` (mesma resposta, não revela se o cliente existe) |
| JSON inválido ou fora do contrato | `400 {"error":"invalid_payload","details":[...]}` |
| Corpo > 64 KB | `413` |
| Falha interna | `500 {"error":"internal_error"}` (a plataforma reenvia) |

Regra de ordem: o evento atualiza a venda se `occurred_at > last_event_at`, ou se for igual e o status novo tiver posto maior (`pending 0 < approved 1 < canceled 2 < refunded 3 < chargeback 4`). Evento e venda gravados na mesma transação.

## GET /clients/:clientId/report

Cabeçalho: `Authorization: Bearer <token de leitura>`. Query opcional: `from`, `to` (`YYYY-MM-DD`, intervalo fechado sobre `sold_at` em UTC), `platform`.

```json
{
  "client_id": "demo",
  "filters": { "from": "2026-10-01", "to": "2026-10-31", "platform": null },
  "generated_at": "2026-10-27T15:00:00.000Z",
  "currencies": [
    {
      "currency": "BRL",
      "by_status": {
        "pending":    { "count": 1, "amount_cents": 4990 },
        "approved":   { "count": 10, "amount_cents": 197900 },
        "canceled":   { "count": 0, "amount_cents": 0 },
        "refunded":   { "count": 2, "amount_cents": 39580 },
        "chargeback": { "count": 0, "amount_cents": 0 }
      },
      "net_revenue_cents": 197900,
      "products": [
        { "product_id": "curso-ts", "product_name": "Curso de TypeScript", "approved_count": 10, "net_revenue_cents": 197900 }
      ]
    }
  ]
}
```

- `net_revenue_cents` = soma das vendas cujo status atual é `approved`. Moedas nunca se somam entre si.
- `products` ordenado por `net_revenue_cents` desc; nome = o do evento mais recente.
- Erros: `401 {"error":"unauthorized"}` (token errado, ausente ou cliente inexistente), `400 {"error":"invalid_query"}` (data inválida ou `from > to`).

## GET /health

`200 {"status":"ok"}` quando o banco responde a `select 1`; `503` caso contrário.
