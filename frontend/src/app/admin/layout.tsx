import AdminShell from '@/components/AdminShell'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Sem sessão só sobra /admin/login (o middleware barra o resto): renderiza
  // a página sem a navegação, senão a tela de login viria com um botão "Sair".
  if (!user) return <>{children}</>

  // Login não é permissão: a RLS exige estar em public.admins. Sem esta
  // checagem o não-admin cairia num dashboard vazio, indistinguível de "ainda
  // não cadastrei eventos".
  const { data: isAdmin } = await supabase.rpc('is_admin')

  return (
    <AdminShell email={user.email ?? ''}>
      {isAdmin ? (
        children
      ) : (
        <main className="mx-auto w-full max-w-xl px-4 py-16">
          <div className="rounded-card border border-secondary-fixed-dim bg-secondary-container/30 p-8">
            <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary-fixed">
              <Icon name="shield_person" className="text-on-secondary-fixed" />
            </span>
            <h1 className="font-display text-headline-md text-on-secondary-fixed">
              Conta sem permissão de admin
            </h1>
            <p className="mt-3 text-body-md text-on-secondary-fixed-variant">
              Você está autenticado como <strong className="font-semibold">{user.email}</strong>,
              mas essa conta não consta na lista de administradores, então não enxerga nenhum dado.
            </p>
            <p className="mt-2 text-label-md text-on-secondary-fixed-variant">
              Se essa conta deveria ser admin, rode o passo de promoção descrito no fim de{' '}
              <code className="rounded-full bg-surface px-2 py-0.5 font-mono text-label-sm">
                supabase/schema.sql
              </code>
              .
            </p>
          </div>
        </main>
      )}
    </AdminShell>
  )
}
