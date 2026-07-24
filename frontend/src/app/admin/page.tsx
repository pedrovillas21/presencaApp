import EventCard from '@/components/EventCard'
import EventForm from '@/components/EventForm'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/server'
import type { EventWithCount } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: events, error } = await supabase
    .from('events')
    .select('*, attendees(count)')
    .order('created_at', { ascending: false })
    .returns<EventWithCount[]>()

  const openCount = events?.filter((event) => event.is_open).length ?? 0

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8">
      <header className="mb-8">
        <h1 className="font-display text-[28px] leading-tight text-on-surface md:text-headline-lg">
          Gerenciar Eventos
        </h1>
        <p className="mt-2 text-body-md text-muted">
          Crie novos eventos ou gerencie as listas de presença ativas.
        </p>
      </header>

      <section className="relative mb-12 overflow-hidden rounded-card border border-border bg-surface p-6 md:p-8">
        {/* Halo difuso do canto — assinatura visual dos cards de destaque. */}
        <div className="pointer-events-none absolute -right-20 -top-20 z-0 size-64 rounded-full bg-primary-fixed-dim/20 blur-3xl" />

        <div className="relative z-10">
          <h2 className="mb-6 flex items-center gap-3 font-display text-headline-md text-on-surface">
            <StepBadge n={1} />
            Criar Novo Evento
          </h2>
          <EventForm />
        </div>
      </section>

      <section>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-3 font-display text-headline-md text-on-surface">
            <StepBadge n={2} tone="secondary" />
            Eventos Cadastrados
          </h2>
          <span className="flex items-center gap-2 text-label-sm text-muted">
            <span
              className={`size-2 rounded-full ${openCount > 0 ? 'animate-pulse bg-secondary' : 'bg-outline-variant'}`}
            />
            {openCount === 1 ? '1 lista aberta' : `${openCount} listas abertas`}
          </span>
        </div>

        {error ? (
          <p className="alert-error">Não foi possível carregar os eventos: {error.message}</p>
        ) : !events || events.length === 0 ? (
          <div className="rounded-card border border-dashed border-outline-variant bg-surface p-12 text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-surface-container">
              <Icon name="calendar_add_on" className="text-[28px] text-muted" />
            </span>
            <p className="text-body-md text-on-surface-variant">Nenhum evento cadastrado ainda.</p>
            <p className="mt-1 text-label-md text-muted">
              Use o formulário acima para criar o primeiro.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function StepBadge({ n, tone = 'primary' }: { n: number; tone?: 'primary' | 'secondary' }) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-full font-sans text-label-md ${
        tone === 'primary'
          ? 'bg-primary-container text-on-primary'
          : 'bg-secondary-container text-on-secondary-container'
      }`}
    >
      {n}
    </span>
  )
}
