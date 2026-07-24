import AttendanceForm from '@/components/AttendanceForm'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/server'
import { formatEventDate } from '@/lib/datetime'
import type { PublicEvent } from '@/lib/types'

// A lista de eventos abertos muda durante o dia — nunca servir cache estático.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()

  // RLS: anon só enxerga eventos com is_open = true.
  const { data: events, error } = await supabase
    .from('events')
    .select('id, name, event_date, location')
    .eq('is_open', true)
    .order('event_date')
    .returns<PublicEvent[]>()

  // Com um único evento aberto o painel vira a capa dele; com vários, uma
  // chamada genérica, já que o participante ainda vai escolher no formulário.
  const single = events?.length === 1 ? events[0] : null

  // min-h (e não h): com h-screen o card do formulário transborda os 100vh e o
  // painel lateral fica parado no meio da página rolada.
  return (
    <main className="flex w-full flex-1 flex-col lg:min-h-screen lg:flex-row">
      <BrandPanel event={single} openCount={events?.length ?? 0} />

      <section className="relative z-10 -mt-8 flex flex-grow items-center justify-center p-4 lg:-ml-8 lg:mt-0 lg:w-1/2 lg:p-12">
        <div className="w-full max-w-md rounded-card border border-border bg-surface p-8 shadow-ambient lg:max-w-[480px] lg:p-10">
          <div className="mb-8">
            <h2 className="font-display text-headline-md text-on-surface">Check-in</h2>
            <p className="mt-2 text-body-md text-muted">
              Preencha seus dados para confirmar presença.
            </p>
          </div>

          {error ? (
            <p className="alert-error">
              Não foi possível carregar os eventos no momento. Recarregue a página em instantes.
            </p>
          ) : !events || events.length === 0 ? (
            <div className="rounded-card border border-border bg-surface-container-low p-8 text-center">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-surface-container-high">
                <Icon name="event_busy" className="text-[28px] text-muted" />
              </span>
              <p className="text-body-md text-on-surface-variant">
                Nenhum evento aberto para registro no momento.
              </p>
              <p className="mt-2 text-label-md text-muted">
                Procure a organização se o seu evento já começou.
              </p>
            </div>
          ) : (
            <AttendanceForm events={events} />
          )}
        </div>
      </section>
    </main>
  )
}

function BrandPanel({ event, openCount }: { event: PublicEvent | null; openCount: number }) {
  const date = formatEventDate(event?.event_date)

  // Sem h-full: o stretch do flex já estica o painel até a altura da linha.
  return (
    <section className="relative z-0 flex shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-container to-primary p-8 lg:w-1/2 lg:p-16">
      {/* Formas difusas: profundidade sem imagem, conforme o exemplo. */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-1/4 size-80 rounded-full bg-secondary-container/20 blur-3xl" />

      <div className="relative z-10 flex flex-grow flex-col justify-center gap-12 lg:gap-20">
        <div className="flex items-center gap-3">
          <Icon name="event_available" filled className="text-[36px] text-secondary-fixed" />
          <h1 className="font-display text-headline-md tracking-tight text-white">Presença</h1>
        </div>

        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-label-sm uppercase text-primary-fixed backdrop-blur-md">
            <span className="size-2 animate-pulse rounded-full bg-secondary-fixed" />
            {openCount > 0 ? 'Lista aberta' : 'Nenhuma lista aberta'}
          </span>

          <h2 className="max-w-lg font-display text-[28px] leading-tight text-white drop-shadow-md lg:text-headline-xl">
            {event ? event.name : 'Confirme sua presença'}
          </h2>

          <p className="max-w-md text-body-lg text-primary-fixed opacity-90">
            {event
              ? 'Por favor, confirme sua presença para constar na lista oficial do evento.'
              : 'Escolha o evento ao lado e preencha seus dados para constar na lista de presença.'}
          </p>
        </div>

        {event && (date || event.location) && (
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {date && (
              <InfoTile icon="calendar_today" label="Data" value={date} />
            )}
            {event.location && (
              <InfoTile icon="location_on" label="Local" value={event.location} />
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 mt-12 border-t border-white/10 pt-8">
        <p className="text-label-sm text-primary-fixed/50">
          Seus dados são usados apenas para a lista de presença deste evento.
        </p>
      </div>
    </section>
  )
}

function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
        <Icon name={icon} className="text-primary-fixed" />
      </span>
      <div className="min-w-0">
        <p className="text-label-sm uppercase text-primary-fixed/70">{label}</p>
        <p className="text-body-md font-medium text-white">{value}</p>
      </div>
    </div>
  )
}
