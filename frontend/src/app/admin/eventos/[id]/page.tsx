import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/EventCard'
import AttendeeTable from '@/components/AttendeeTable'
import Icon from '@/components/Icon'
import ReportButton from '@/components/ReportButton'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatEventDate } from '@/lib/datetime'
import type { AttendeeRow, EventRow } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle<EventRow>()

  if (!event) notFound()

  const { data: attendees, error } = await supabase
    .from('attendees')
    .select('id, full_name, cpf, email, phone, attendance_location, signature_data, created_at')
    .eq('event_id', id)
    .order('created_at', { ascending: true })
    .returns<AttendeeRow[]>()

  const date = formatEventDate(event.event_date)
  const total = attendees?.length ?? 0
  const rate = event.max_attendees > 0 ? (total / event.max_attendees) * 100 : 0

  const remaining = Math.max(0, event.max_attendees - total)
  const lastCheckIn = attendees?.length ? attendees[attendees.length - 1].created_at : null

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-label-md text-muted transition-colors hover:text-primary"
      >
        <Icon name="arrow_back" className="text-[18px]" />
        Voltar para os eventos
      </Link>

      {/* Cabeçalho e números no mesmo cartão: menos rolagem até a lista. */}
      <section className="relative overflow-hidden rounded-card border border-border bg-surface">
        <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-primary-fixed-dim/20 blur-3xl" />

        <header className="relative z-10 flex flex-col justify-between gap-4 border-b border-border p-5 md:flex-row md:items-center md:p-6">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[26px] leading-tight text-on-surface md:text-headline-lg">
                {event.name}
              </h1>
              <StatusBadge isOpen={event.is_open} />
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md text-muted">
              {event.location && (
                <span className="flex items-center gap-1">
                  <Icon name="location_on" className="text-[18px]" />
                  {event.location}
                </span>
              )}
              {date && (
                <span className="flex items-center gap-1">
                  <Icon name="calendar_month" className="text-[18px]" />
                  {date}
                </span>
              )}
              {lastCheckIn && (
                <span className="flex items-center gap-1">
                  <Icon name="schedule" className="text-[18px]" />
                  Último check-in: {formatDateTime(lastCheckIn)}
                </span>
              )}
              {!event.location && !date && !lastCheckIn && 'Sem data ou local definidos'}
            </p>
          </div>

          <div className="shrink-0">
            <ReportButton eventId={event.id} />
          </div>
        </header>

        <div className="relative z-10 grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
          <Stat
            label="Presentes"
            icon="check_circle"
            iconClass="bg-primary-fixed text-primary"
            value={String(total)}
            hint={total === 1 ? 'pessoa' : 'pessoas'}
          />
          <Stat
            label="Capacidade"
            icon="groups"
            iconClass="bg-surface-container-high text-on-surface-variant"
            value={String(event.max_attendees)}
            hint="vagas totais"
          />
          <Stat
            label="Vagas restantes"
            icon="event_seat"
            iconClass="bg-secondary-fixed/40 text-on-secondary-fixed-variant"
            value={String(remaining)}
            hint={remaining === 0 ? 'lotado' : 'ainda disponíveis'}
          />

          <div className="flex flex-col justify-between gap-2 border-t border-border p-5 md:border-t-0">
            <span className="flex items-center justify-between gap-2">
              <span className="text-label-sm uppercase tracking-wider text-muted">
                Taxa de adesão
              </span>
              <span className="flex size-8 items-center justify-center rounded-full bg-primary-fixed text-primary">
                <Icon name="trending_up" className="text-[18px]" />
              </span>
            </span>
            <span className="font-display text-[28px] leading-none text-primary">
              {rate.toFixed(1)}%
            </span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, rate)}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="alert-error">Não foi possível carregar os participantes: {error.message}</p>
      ) : (
        <AttendeeTable attendees={attendees ?? []} />
      )}
    </main>
  )
}

function Stat({
  label,
  icon,
  iconClass,
  value,
  hint,
}: {
  label: string
  icon: string
  iconClass: string
  value: string
  hint: string
}) {
  return (
    <div className="flex flex-col justify-between gap-2 border-t border-border p-5 md:border-t-0">
      <span className="flex items-center justify-between gap-2">
        <span className="text-label-sm uppercase tracking-wider text-muted">{label}</span>
        <span className={`flex size-8 items-center justify-center rounded-full ${iconClass}`}>
          <Icon name={icon} className="text-[18px]" />
        </span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-display text-[28px] leading-none text-on-surface">{value}</span>
        <span className="text-label-md text-muted">{hint}</span>
      </span>
    </div>
  )
}
