import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusBadge } from '@/components/EventCard'
import AttendeeTable from '@/components/AttendeeTable'
import Icon from '@/components/Icon'
import ReportButton from '@/components/ReportButton'
import { createClient } from '@/lib/supabase/server'
import { formatEventDate } from '@/lib/datetime'
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

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-8 md:px-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-label-md text-muted transition-colors hover:text-primary"
      >
        <Icon name="arrow_back" className="text-[18px]" />
        Voltar para os eventos
      </Link>

      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[28px] leading-tight text-on-surface md:text-headline-lg">
              {event.name}
            </h1>
            <StatusBadge isOpen={event.is_open} />
          </div>
          <p className="flex flex-wrap items-center gap-2 text-body-md text-muted">
            {event.location && (
              <span className="flex items-center gap-1">
                <Icon name="location_on" className="text-[18px]" />
                {event.location}
              </span>
            )}
            {event.location && date && <span className="text-border">|</span>}
            {date && (
              <span className="flex items-center gap-1">
                <Icon name="calendar_month" className="text-[18px]" />
                {date}
              </span>
            )}
            {!event.location && !date && 'Sem data ou local definidos'}
          </p>
        </div>

        <ReportButton eventId={event.id} />
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          label="Presentes"
          icon="check_circle"
          iconClass="bg-secondary-fixed/30 text-on-secondary-fixed-variant"
          value={String(total)}
          unit="pessoas"
        />
        <StatCard
          label="Meta de vagas"
          icon="groups"
          iconClass="bg-primary-fixed/40 text-primary"
          value={String(event.max_attendees)}
          unit="capacidade"
        />

        <div className="relative flex h-40 flex-col justify-between overflow-hidden rounded-card border border-border bg-surface p-6">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-fixed/30 to-transparent" />
          <div className="relative z-10 flex items-start justify-between">
            <span className="text-label-md font-bold uppercase tracking-wider text-on-surface-variant">
              Taxa de adesão
            </span>
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-container-high">
              <Icon name="trending_up" className="text-on-surface" />
            </span>
          </div>
          <div className="relative z-10">
            <span className="font-display text-headline-lg text-primary md:text-[40px]">
              {rate.toFixed(1)}%
            </span>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, rate)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p className="alert-error">Não foi possível carregar os participantes: {error.message}</p>
      ) : (
        <AttendeeTable attendees={attendees ?? []} />
      )}
    </main>
  )
}

function StatCard({
  label,
  icon,
  iconClass,
  value,
  unit,
}: {
  label: string
  icon: string
  iconClass: string
  value: string
  unit: string
}) {
  return (
    <div className="flex h-40 flex-col justify-between rounded-card border border-border bg-surface p-6">
      <div className="flex items-start justify-between">
        <span className="text-label-md uppercase tracking-wider text-muted">{label}</span>
        <span className={`flex size-10 items-center justify-center rounded-full ${iconClass}`}>
          <Icon name={icon} />
        </span>
      </div>
      <div>
        <span className="font-display text-headline-lg text-on-surface md:text-[40px]">{value}</span>
        <span className="ml-2 text-body-md text-muted">{unit}</span>
      </div>
    </div>
  )
}
