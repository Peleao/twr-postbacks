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
