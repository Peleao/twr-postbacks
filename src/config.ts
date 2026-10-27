import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Só os nomes das variáveis: o valor pode conter senha.
    const nomes = [...new Set(result.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Configuração inválida: ${nomes.join(', ')}`);
  }
  return result.data;
}
