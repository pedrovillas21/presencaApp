'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandLogo from '@/components/BrandLogo'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha incorretos.')
      setSubmitting(false)
      return
    }

    // refresh() para o middleware enxergar o cookie de sessão recém-criado.
    router.replace('/admin')
    router.refresh()
  }

  return (
    <main className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-shell via-primary to-primary-container p-4 py-12">
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-80 rounded-full bg-secondary-container/20 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandLogo className="max-w-[220px]" priority />
        </div>

        <div className="rounded-card border border-border bg-surface p-8 shadow-ambient md:p-10">
          <h1 className="font-display text-headline-md text-on-surface">Área do administrador</h1>
          <p className="mt-2 text-body-md text-muted">
            Entre para gerenciar eventos e listas de presença.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="group space-y-2">
              <label htmlFor="email" className="block text-label-md text-on-surface">
                E-mail
              </label>
              <div className="relative">
                <Icon
                  name="mail"
                  className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary"
                />
                <input
                  id="email"
                  type="email"
                  className="field field-icon"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="group space-y-2">
              <label htmlFor="password" className="block text-label-md text-on-surface">
                Senha
              </label>
              <div className="relative">
                <Icon
                  name="lock"
                  className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary"
                />
                <input
                  id="password"
                  type="password"
                  className="field field-icon"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="alert-error">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entrar'}
              <Icon
                name={submitting ? 'progress_activity' : 'arrow_forward'}
                className={submitting ? 'animate-spin' : ''}
              />
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
