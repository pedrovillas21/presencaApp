import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { cookies } from 'next/headers'

// createServerClient é sobrecarregado (getAll/setAll vs. o get/set/remove
// legado), então o TS não infere os parâmetros do callback sozinho.
type CookiesToSet = Parameters<SetAllCookies>[0]

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Chamado de um Server Component: o middleware já cuida do refresh
            // do cookie, então pode ser ignorado com segurança.
          }
        },
      },
    }
  )
}
