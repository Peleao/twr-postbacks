import type { Db } from '../db.js';
import { dateRange, type ReportFilters } from './query.js';

const STATUSES = ['pending', 'approved', 'canceled', 'refunded', 'chargeback'] as const;
type Status = (typeof STATUSES)[number];
type Total = { count: number; amount_cents: number };

export type Report = {
  client_id: string;
  filters: ReportFilters;
  generated_at: string;
  currencies: {
    currency: string;
    by_status: Record<Status, Total>;
    net_revenue_cents: number;
    products: { product_id: string; product_name: string; approved_count: number; net_revenue_cents: number }[];
  }[];
};

export async function buildReport(
  db: Db,
  clientId: string,
  filters: ReportFilters,
  now = new Date(),
): Promise<Report> {
  // filtro comum às duas queries; valores sempre por parâmetro posicional
  const { start, endExclusive } = dateRange(filters);
  const conds = ['client_id = $1'];
  const params: unknown[] = [clientId];
  if (start) conds.push(`sold_at >= $${params.push(start)}`);
  if (endExclusive) conds.push(`sold_at < $${params.push(endExclusive)}`);
  if (filters.platform) conds.push(`platform = $${params.push(filters.platform)}`);
  const where = conds.join(' and ');

  const totals = await db.query<{ currency: string; status: Status; count: number; amount: number }>(
    `select currency, status, count(*) as count, sum(amount_cents) as amount
     from sales where ${where} group by currency, status`,
    params,
  );
  const products = await db.query<{
    currency: string;
    product_id: string;
    product_name: string;
    approved_count: number;
    net: number;
  }>(
    `select currency, product_id,
            (array_agg(product_name order by last_event_at desc))[1] as product_name,
            count(*) filter (where status = 'approved') as approved_count,
            coalesce(sum(amount_cents) filter (where status = 'approved'), 0) as net
     from sales where ${where}
     group by currency, product_id
     having count(*) filter (where status = 'approved') > 0
     order by net desc, product_id asc`,
    params,
  );

  const byCurrency = new Map<string, Report['currencies'][number]>();
  const entryFor = (currency: string) => {
    let e = byCurrency.get(currency);
    if (!e) {
      const by_status = {} as Record<Status, Total>;
      for (const s of STATUSES) by_status[s] = { count: 0, amount_cents: 0 };
      e = { currency, by_status, net_revenue_cents: 0, products: [] };
      byCurrency.set(currency, e);
    }
    return e;
  };

  for (const r of totals.rows) {
    entryFor(r.currency).by_status[r.status] = { count: Number(r.count), amount_cents: Number(r.amount) };
  }
  for (const r of products.rows) {
    entryFor(r.currency).products.push({
      product_id: r.product_id,
      product_name: r.product_name,
      approved_count: Number(r.approved_count),
      net_revenue_cents: Number(r.net),
    });
  }

  const currencies = [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  for (const c of currencies) c.net_revenue_cents = c.by_status.approved.amount_cents;

  return { client_id: clientId, filters, generated_at: now.toISOString(), currencies };
}
