import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  console.error(`Variáveis de ambiente inválidas:\n${issues}`)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
}
