import { parseArgs } from 'node:util';
import { buildSampleEvent, signBody } from '../src/sample.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    client: { type: 'string' },
    secret: { type: 'string' },
    type: { type: 'string', default: 'sale.approved' },
    sale: { type: 'string', default: 'ord_1' },
    amount: { type: 'string' },
    event: { type: 'string' },
  },
});

if (!values.url || !values.client || !values.secret) {
  console.error(
    'uso: npm run send-sample -- --url <url> --client <id> --secret <segredo> [--type sale.approved] [--sale ord_1] [--amount centavos] [--event evt_id]',
  );
  process.exit(1);
}

const body = buildSampleEvent({
  type: values.type,
  saleId: values.sale,
  amountCents: values.amount ? Number(values.amount) : undefined,
  eventId: values.event,
});
const res = await fetch(`${values.url}/webhooks/${values.client}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-TWR-Signature': signBody(body, values.secret) },
  body,
});

console.log(`event_id: ${(JSON.parse(body) as { event_id: string }).event_id}`);
console.log(`status: ${res.status}`);
console.log(await res.text());
