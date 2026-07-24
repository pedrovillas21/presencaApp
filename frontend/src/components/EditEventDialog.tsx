'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/client'
import type { EventRow } from '@/lib/types'

export default function EditEventDialog({
  event,
  attendeeCount,
}: {
  event: EventRow
  attendeeCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(event.name)
  const [eventDate, setEventDate] = useState(event.event_date ?? '')
  const [location, setLocation] = useState(event.location ?? '')
  const [maxAttendees, setMaxAttendees] = useState(String(event.max_attendees))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(event.name)
    setEventDate(event.event_date ?? '')
    setLocation(event.location ?? '')
    setMaxAttendees(String(event.max_attendees))
    setError(null)
  }

  function close() {
    if (saving) return
    reset()
    setOpen(false)
  }

  function openEditor() {
    reset()
    setOpen(true)
  }

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }

    if (open) window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (name.trim().length < 3) {
      setError('O nome do evento precisa ter ao menos 3 caracteres.')
      return
    }

    const capacity = Number(maxAttendees)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
      setError('O limite de participantes precisa ser um número entre 1 e 100000.')
      return
    }

    if (capacity < attendeeCount) {
      setError(`O limite não pode ser menor que os ${attendeeCount} participantes já presentes.`)
      return
    }

    setSaving(true)
    const { error } = await createClient()
      .from('events')
      .update({
        name: name.trim(),
        event_date: eventDate || null,
        location: location.trim() || null,
        max_attendees: capacity,
      })
      .eq('id', event.id)
    setSaving(false)

    if (error) {
      setError(`Não foi possível salvar as alterações: ${error.message}`)
      return
    }

    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        aria-label={`Editar ${event.name}`}
        title="Editar evento"
        className="btn-ghost btn-sm shrink-0 px-4 text-primary"
      >
        <Icon name="edit" />
        <span className="hidden sm:inline">Editar</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end bg-on-surface/45 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
          onMouseDown={close}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-event-${event.id}`}
            className="w-full max-w-2xl rounded-t-card bg-surface p-6 shadow-2xl sm:rounded-card sm:p-8"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-label-sm uppercase tracking-wider text-primary">Evento cadastrado</p>
                <h2 id={`edit-event-${event.id}`} className="mt-1 font-display text-headline-md text-on-surface">
                  Editar evento
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fechar edição"
                className="rounded-full p-2 text-muted transition-colors hover:bg-surface-container"
              >
                <Icon name="close" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor={`edit-name-${event.id}`} className="label-field">
                  Nome do evento
                </label>
                <input
                  id={`edit-name-${event.id}`}
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  required
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div>
                  <label htmlFor={`edit-date-${event.id}`} className="label-field">
                    Data
                  </label>
                  <input
                    id={`edit-date-${event.id}`}
                    type="date"
                    className="field"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label htmlFor={`edit-location-${event.id}`} className="label-field">
                    Local
                  </label>
                  <input
                    id={`edit-location-${event.id}`}
                    className="field"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={160}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label htmlFor={`edit-capacity-${event.id}`} className="label-field">
                    Limite de participantes
                  </label>
                  <input
                    id={`edit-capacity-${event.id}`}
                    type="number"
                    min={attendeeCount}
                    max={100000}
                    className="field text-center"
                    value={maxAttendees}
                    onChange={(e) => setMaxAttendees(e.target.value)}
                    disabled={saving}
                  />
                  <p className="ml-2 mt-2 text-label-sm text-muted">Mínimo: {attendeeCount} presentes.</p>
                </div>
              </div>

              {error && <p role="alert" className="alert-error">{error}</p>}

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={close} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                  <Icon name={saving ? 'progress_activity' : 'save'} className={saving ? 'animate-spin' : ''} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
