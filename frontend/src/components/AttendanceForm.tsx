'use client'

import { useState } from 'react'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/client'
import { isValidCpf, maskCpf, unmaskCpf } from '@/lib/cpf'
import { isValidPhone, maskPhone, unmaskPhone } from '@/lib/phone'
import { formatEventDate } from '@/lib/datetime'
import type { PublicEvent } from '@/lib/types'

type Props = { events: PublicEvent[] }
type Errors = Partial<Record<'eventId' | 'fullName' | 'cpf' | 'email' | 'phone', string>>

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const describeEvent = (event: PublicEvent) =>
  [event.name, formatEventDate(event.event_date), event.location].filter(Boolean).join(' · ')

export default function AttendanceForm({ events }: Props) {
  const [eventId, setEventId] = useState(events.length === 1 ? events[0].id : '')
  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState<PublicEvent | null>(null)

  function validate(): Errors {
    const next: Errors = {}
    if (!eventId) next.eventId = 'Selecione o evento.'
    if (fullName.trim().length < 3) next.fullName = 'Informe seu nome completo.'
    if (!isValidCpf(cpf)) next.cpf = 'CPF inválido — confira os números.'
    if (!EMAIL_RE.test(email.trim())) next.email = 'E-mail inválido.'
    if (phone && !isValidPhone(phone)) next.phone = 'Telefone incompleto.'
    return next
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    const supabase = createClient()

    // Sem .select(): anon não tem policy de SELECT em attendees, e pedir os
    // dados de volta transformaria um insert válido em erro de permissão.
    const { error } = await supabase.from('attendees').insert({
      event_id: eventId,
      full_name: fullName.trim(),
      cpf: unmaskCpf(cpf),
      email: email.trim().toLowerCase(),
      phone: phone ? unmaskPhone(phone) : null,
    })

    setSubmitting(false)

    if (error) {
      setFormError(messageForError(error.code))
      return
    }

    setConfirmed(events.find((ev) => ev.id === eventId) ?? null)
  }

  if (confirmed) {
    return (
      <section className="rounded-card border border-secondary-fixed-dim bg-secondary-container/30 p-8 text-center">
        <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-secondary-fixed">
          <Icon name="check_circle" filled className="text-[32px] text-on-secondary-fixed" />
        </span>
        <h3 className="font-display text-headline-md text-on-secondary-fixed">
          Presença registrada!
        </h3>
        <p className="mt-3 text-body-md text-on-secondary-fixed-variant">
          Seu registro em <strong className="font-semibold">{confirmed.name}</strong> foi confirmado.
        </p>
        <p className="mt-2 text-label-md text-on-secondary-fixed-variant/80">
          Não esqueça de assinar a lista impressa no local.
        </p>
      </section>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Com um evento aberto o select seria uma escolha de um item só. */}
      {events.length > 1 && (
        <Field label="Evento" error={errors.eventId} htmlFor="event" icon="event">
          <select
            id="event"
            className="field field-icon cursor-pointer appearance-none pr-12"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            disabled={submitting}
          >
            <option value="">Selecione o evento…</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {describeEvent(event)}
              </option>
            ))}
          </select>
          <Icon
            name="expand_more"
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
          />
        </Field>
      )}

      <Field label="Nome completo" error={errors.fullName} htmlFor="fullName" icon="person">
        <input
          id="fullName"
          className="field field-icon"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          placeholder="João Silva"
          disabled={submitting}
        />
      </Field>

      <Field
        label="CPF"
        error={errors.cpf}
        htmlFor="cpf"
        icon="badge"
        hint="Apenas números"
      >
        <input
          id="cpf"
          className="field field-icon tabular-nums"
          value={cpf}
          onChange={(e) => setCpf(maskCpf(e.target.value))}
          inputMode="numeric"
          placeholder="000.000.000-00"
          disabled={submitting}
        />
      </Field>

      <Field label="E-mail" error={errors.email} htmlFor="email" icon="mail">
        <input
          id="email"
          type="email"
          className="field field-icon"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="voce@email.com"
          disabled={submitting}
        />
      </Field>

      <Field label="Telefone" error={errors.phone} htmlFor="phone" icon="call" hint="Opcional">
        <input
          id="phone"
          className="field field-icon tabular-nums"
          value={phone}
          onChange={(e) => setPhone(maskPhone(e.target.value))}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(00) 00000-0000"
          disabled={submitting}
        />
      </Field>

      {formError && (
        <p role="alert" className="alert-error">
          {formError}
        </p>
      )}

      <div className="pt-2">
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Registrando…' : 'Confirmar presença'}
          <Icon name={submitting ? 'progress_activity' : 'arrow_forward'} className={submitting ? 'animate-spin' : ''} />
        </button>
      </div>
    </form>
  )
}

/** Traduz os códigos que o Postgres/PostgREST devolve nesse fluxo. */
function messageForError(code?: string) {
  switch (code) {
    case '23505':
      return 'Você já registrou presença neste evento.'
    case '23514':
      return 'Dados inválidos, confira o CPF.'
    case '42501':
      return 'Este evento não está mais aberto.'
    case 'P0001':
      // Única exception explícita no caminho do insert (trigger de capacidade).
      return 'Este evento atingiu o limite de participantes. Procure a organização.'
    default:
      return 'Não foi possível registrar sua presença. Tente novamente.'
  }
}

function Field({
  label,
  error,
  htmlFor,
  icon,
  hint,
  children,
}: {
  label: string
  error?: string
  htmlFor: string
  icon: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="group space-y-2">
      <label htmlFor={htmlFor} className="block text-label-md text-on-surface">
        {label}
      </label>
      <div className="relative">
        <Icon
          name={icon}
          className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary"
        />
        {children}
      </div>
      {error ? (
        <p className="ml-2 text-label-sm text-error">{error}</p>
      ) : hint ? (
        <p className="ml-2 text-label-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
}
