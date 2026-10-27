import { z } from 'zod';

export type ReportFilters = { from: string | null; to: string | null; platform: string | null };

// YYYY-MM-DD de calendário real (rejeita 2026-02-30 e 2026-1-1)
const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });

const querySchema = z.object({
  from: dateParam.optional(),
  to: dateParam.optional(),
  platform: z.string().min(1).optional(),
});

// null = query inválida
export function parseReportQuery(q: unknown): ReportFilters | null {
  const parsed = querySchema.safeParse(q ?? {});
  if (!parsed.success) return null;
  const { from, to, platform } = parsed.data;
  // YYYY-MM-DD compara certo como texto
  if (from && to && from > to) return null;
  return { from: from ?? null, to: to ?? null, platform: platform ?? null };
}

// `to` é inclusivo: o limite exclusivo é 00:00Z do dia seguinte
export function dateRange(f: ReportFilters): { start: Date | null; endExclusive: Date | null } {
  const start = f.from ? new Date(`${f.from}T00:00:00Z`) : null;
  let endExclusive: Date | null = null;
  if (f.to) {
    endExclusive = new Date(`${f.to}T00:00:00Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  }
  return { start, endExclusive };
}
