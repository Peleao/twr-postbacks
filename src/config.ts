import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // cliente demo criado na subida; só vale se as quatro estiverem definidas
  DEMO_CLIENT_ID: z.string().min(1).optional(),
  DEMO_CLIENT_NAME: z.string().min(1).optional(),
  DEMO_WEBHOOK_SECRET: z.string().min(1).optional(),
  DEMO_READ_TOKEN: z.string().min(1).optional(),
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
