'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/client'
import { formatEventDate } from '@/lib/datetime'
import type { EventWithCount } from '@/lib/types'

export default function EventCard({ event }: { event: EventWithCount }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = event.attendees?.[0]?.count ?? 0
  const details =
    [formatEventDate(event.event_date), event.location].filter(Boolean).join(' · ') ||
    'Sem data ou local definidos'
  const fill = event.max_attendees > 0 ? Math.min(100, (total / event.max_attendees) * 100) : 0

  async function toggleOpen() {
    setBusy(true)
    setError(null)
    const { error } = await createClient()
      .from('events')
      .update({ is_open: !event.is_open })
      .eq('id', event.id)
    setBusy(false)

    if (error) {
      setError('Não foi possível alterar o estado do evento.')
      return
    }
    router.refresh()
  }

  async function copyLink() {
    // A home já filtra pelos eventos abertos — o link é sempre a raiz.
    await navigator.clipboard.writeText(window.location.origin + '/')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <article
      className={`flex h-full flex-col rounded-card border border-border bg-surface p-6 transition-shadow hover:shadow-lifted ${
        event.is_open ? '' : 'opacity-90'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-display text-headline-sm text-on-surface">{event.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-label-sm text-muted">
            <Icon name="schedule" className="text-[16px]" />
            <span className="truncate">{details}</span>
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={event.is_open}
          aria-label={event.is_open ? 'Fechar preenchimento' : 'Abrir preenchimento'}
          onClick={toggleOpen}
          disabled={busy}
          className="flex shrink-0 items-center gap-3 disabled:opacity-60"
        >
          <span
            className={`relative block h-8 w-14 rounded-full border transition-colors ${
              event.is_open
                ? 'border-secondary bg-secondary'
                : 'border-outline-variant bg-surface-variant'
            }`}
          >
            <span
              className={`absolute left-1 top-1 block size-6 rounded-full border border-border bg-white shadow-sm transition-transform ${
                event.is_open ? 'translate-x-6' : ''
              }`}
            />
          </span>
          <span
            className={`w-[60px] text-left text-label-sm ${
              event.is_open ? 'text-on-surface-variant' : 'text-muted'
            }`}
          >
            {busy ? '…' : event.is_open ? 'Aberto' : 'Fechado'}
          </span>
        </button>
      </div>

      <div className="mt-6 border-t border-surface-container-high pt-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-2 text-label-sm text-muted">
            <Icon name="group" className="text-[18px]" />
            {total === 1 ? '1 presente' : `${total} presentes`}
          </div>
          <div className="text-right">
            <span className="font-display text-headline-md text-primary">{total}</span>
            <span className="text-label-sm text-muted"> / {event.max_attendees}</span>
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
          <div
            className={`h-2 rounded-full transition-all ${event.is_open ? 'bg-primary' : 'bg-outline-variant'}`}
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>

      {error && <p className="mt-3 text-label-sm text-error">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/admin/eventos/${event.id}`}
          className="btn-ghost btn-sm flex-1 bg-surface-container hover:bg-surface-container-high"
        >
          Ver lista completa
        </Link>
        <button
          type="button"
          onClick={copyLink}
          aria-label="Copiar link do formulário"
          className="btn-ghost btn-sm w-14 shrink-0 px-0 text-primary"
        >
          <Icon name={copied ? 'check' : 'link'} />
        </button>
      </div>
    </article>
  )
}

export function StatusBadge({ isOpen }: { isOpen: boolean }) {
  return (
    <span
      className={`chip ${
        isOpen
          ? 'bg-secondary-container text-on-secondary-container'
          : 'border border-border bg-surface-variant text-muted'
      }`}
    >
      <span className={`size-2 rounded-full ${isOpen ? 'bg-secondary' : 'bg-outline'}`} />
      {isOpen ? 'Aberto' : 'Fechado'}
    </span>
  )
}
