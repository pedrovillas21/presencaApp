'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/client'

const DEFAULT_MAX = 500

export default function EventForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [maxAttendees, setMaxAttendees] = useState(String(DEFAULT_MAX))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setEventDate('')
    setLocation('')
    setMaxAttendees(String(DEFAULT_MAX))
    setError(null)
  }

  function step(delta: number) {
    const next = (Number(maxAttendees) || 0) + delta
    setMaxAttendees(String(Math.min(100000, Math.max(1, next))))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (name.trim().length < 3) {
      setError('O nome do evento precisa ter ao menos 3 caracteres.')
      return
    }

    const limite = Number(maxAttendees)
    if (!Number.isInteger(limite) || limite < 1 || limite > 100000) {
      setError('O limite de participantes precisa ser um número entre 1 e 100000.')
      return
    }

    setSaving(true)
    const { error } = await createClient()
      .from('events')
      .insert({
        name: name.trim(),
        event_date: eventDate || null,
        location: location.trim() || null,
        max_attendees: limite,
        // Nasce fechado: o admin abre quando o evento começar.
        is_open: false,
      })
    setSaving(false)

    if (error) {
      setError(`Não foi possível criar o evento: ${error.message}`)
      return
    }

    reset()
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className="label-field">
          Nome do Evento
        </label>
        <input
          id="name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Workshop de Design System"
          maxLength={120}
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div>
          <label htmlFor="eventDate" className="label-field">
            Data
          </label>
          <div className="relative">
            <Icon
              name="calendar_today"
              className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted"
            />
            <input
              id="eventDate"
              type="date"
              className="field field-icon appearance-none"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div>
          <label htmlFor="location" className="label-field">
            Local / Sala
          </label>
          <input
            id="location"
            className="field"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Sala 402 ou link"
            disabled={saving}
          />
        </div>

        <div>
          <label htmlFor="maxAttendees" className="label-field">
            Limite de Participantes
          </label>
          <div className="relative flex items-center">
            <input
              id="maxAttendees"
              type="number"
              min={1}
              max={100000}
              className="field appearance-none pr-14 text-center [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={maxAttendees}
              onChange={(e) => setMaxAttendees(e.target.value)}
              disabled={saving}
            />
            <div className="absolute right-3 flex flex-col gap-1">
              <Stepper icon="expand_less" label="Aumentar limite" onClick={() => step(1)} />
              <Stepper icon="expand_more" label="Diminuir limite" onClick={() => step(-1)} />
            </div>
          </div>
          <p className="ml-2 mt-2 text-label-sm text-muted">Trava o formulário ao atingir o teto.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-4 pt-2">
        <button type="button" className="btn-secondary" onClick={reset} disabled={saving}>
          Limpar
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Criar Evento'}
          <Icon name={saving ? 'progress_activity' : 'add_circle'} className={saving ? 'animate-spin' : ''} />
        </button>
      </div>
    </form>
  )
}

function Stepper({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-4 w-6 items-center justify-center rounded-sm bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-variant"
    >
      <Icon name={icon} className="text-[16px]" />
    </button>
  )
}
