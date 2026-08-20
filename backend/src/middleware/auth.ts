import type { NextFunction, Request, Response } from 'express'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { env } from '../env'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      supabase: SupabaseClient
      user: User
    }
  }
}

/**
 * Valida o Bearer JWT do admin e anexa um client Supabase escopado nesse token.
 * Todas as queries do backend passam pela RLS como `authenticated` — nunca
 * usamos a service_role key, então um vazamento do container não vira acesso
 * irrestrito ao banco.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' })
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' })
  }

  req.supabase = supabase
  req.user = data.user
  next()
}
