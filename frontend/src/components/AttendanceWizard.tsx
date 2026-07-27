'use client'

import { useMemo, useState } from 'react'
import Icon from '@/components/Icon'
import SignaturePad from '@/components/SignaturePad'
import { createClient } from '@/lib/supabase/client'
import { isValidCpf, maskCpf, unmaskCpf } from '@/lib/cpf'
import { isValidPhone, maskPhone, unmaskPhone } from '@/lib/phone'
import { formatEventDate } from '@/lib/datetime'
import type { PublicEvent } from '@/lib/types'

type Step = 1 | 2 | 3
type Errors = Partial<
  Record<'eventId' | 'location' | 'fullName' | 'cpf' | 'email' | 'phone' | 'signature', string>
>

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const eventDescription = (event: PublicEvent) =>
  [event.name, formatEventDate(event.event_date), event.location].filter(Boolean).join(' · ')

export default function AttendanceWizard({ events }: { events: PublicEvent[] }) {
  const initialEvent = events.length === 1 ? events[0] : null
  const [step, setStep] = useState<Step>(1)
  const [eventId, setEventId] = useState(initialEvent?.id ?? '')
  const [eventQuery, setEventQuery] = useState(initialEvent?.name ?? '')
  const [resultsOpen, setResultsOpen] = useState(false)
  const [location, setLocation] = useState('')
  const [fullName, setFullName] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState<PublicEvent | null>(null)

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === eventId) ?? null,
    [eventId, events]
  )
  const matches = useMemo(
    () =>
      events
        .map((event) => ({ event, score: eventScore(event, eventQuery) }))
        .filter(({ score }) => Number.isFinite(score))
        .sort((a, b) => a.score - b.score || a.event.name.localeCompare(b.event.name, 'pt-BR'))
        .slice(0, 6)
        .map(({ event }) => event),
    [eventQuery, events]
  )

  const clearError = (field: keyof Errors) => {
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFormError(null)
  }

  const chooseEvent = (event: PublicEvent) => {
    setEventId(event.id)
    setEventQuery(event.name)
    setResultsOpen(false)
    clearError('eventId')
  }

  const contextErrors = (): Errors => {
    const next: Errors = {}
    if (!eventId) next.eventId = 'Escolha um evento da lista.'
    if (location.trim().length < 2) next.location = 'Informe o local onde você está.'
    if (location.trim().length > 160) next.location = 'Use no máximo 160 caracteres.'
    return next
  }

  const detailsErrors = (): Errors => {
    const next: Errors = {}
    if (fullName.trim().length < 3) next.fullName = 'Informe seu nome completo.'
    if (!isValidCpf(cpf)) next.cpf = 'CPF inválido — confira os números.'
    if (!EMAIL_RE.test(email.trim())) next.email = 'E-mail inválido.'
    if (phone && !isValidPhone(phone)) next.phone = 'Telefone incompleto.'
    return next
  }

  const continueFromContext = () => {
    const next = contextErrors()
    setErrors(next)
    if (!Object.keys(next).length) setStep(2)
  }

  const continueFromDetails = () => {
    const next = detailsErrors()
    setErrors(next)
    if (!Object.keys(next).length) setStep(3)
  }

  async function saveAttendance() {
    const next = { ...contextErrors(), ...detailsErrors() }
    if (!signature) next.signature = 'Faça sua assinatura antes de confirmar.'
    setErrors(next)
    if (Object.keys(next).length) {
      if (next.eventId || next.location) setStep(1)
      else if (next.fullName || next.cpf || next.email || next.phone) setStep(2)
      return
    }

    setSubmitting(true)
    setFormError(null)
    const { error } = await createClient().from('attendees').insert({
      event_id: eventId,
      attendance_location: location.trim(),
      full_name: fullName.trim(),
      cpf: unmaskCpf(cpf),
      email: email.trim().toLowerCase(),
      phone: phone ? unmaskPhone(phone) : null,
      signature_data: signature,
    })
    setSubmitting(false)

    if (error) setFormError(messageForError(error.code))
    else setConfirmed(selectedEvent)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (step === 1) continueFromContext()
    else if (step === 2) continueFromDetails()
    else void saveAttendance()
  }

  if (confirmed) {
    return (
      <section className="rounded-card border border-secondary-fixed-dim bg-secondary-container/30 p-8 text-center">
        <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-secondary-fixed">
          <Icon name="check_circle" filled className="text-[32px] text-on-secondary-fixed" />
        </span>
        <h3 className="font-display text-headline-md text-on-secondary-fixed">Presença registrada!</h3>
        <p className="mt-3 text-body-md text-on-secondary-fixed-variant">
          Seu registro em <strong className="font-semibold">{confirmed.name}</strong> foi confirmado.
        </p>
        <p className="mt-2 text-label-md text-on-secondary-fixed-variant">
          Local informado: {location.trim()}
        </p>
      </section>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <StepIndicator current={step} />

      {step === 1 && (
        <section className="space-y-5" aria-labelledby="context-title">
          <StepTitle
            id="context-title"
            title="Evento e local"
            description="Confirme em qual evento e ambiente você está."
          />

          {events.length > 1 ? (
            <Field label="Pesquise o evento" error={errors.eventId} htmlFor="event-search" icon="search">
              <input
                id="event-search"
                type="search"
                role="combobox"
                aria-expanded={resultsOpen}
                aria-controls="event-results"
                aria-autocomplete="list"
                autoComplete="off"
                className="field field-icon"
                value={eventQuery}
                onFocus={() => setResultsOpen(true)}
                onBlur={() => setResultsOpen(false)}
                onChange={(event) => {
                  setEventQuery(event.target.value)
                  setEventId('')
                  setResultsOpen(true)
                  clearError('eventId')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && resultsOpen && !eventId && matches[0]) {
                    event.preventDefault()
                    chooseEvent(matches[0])
                  } else if (event.key === 'Escape') {
                    setResultsOpen(false)
                  }
                }}
                placeholder="Digite o nome do evento"
              />
              {resultsOpen && (
                <div
                  id="event-results"
                  role="listbox"
                  className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-ambient"
                >
                  {matches.length ? (
                    matches.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        role="option"
                        aria-selected={event.id === eventId}
                        onMouseDown={(mouseEvent) => {
                          mouseEvent.preventDefault()
                          chooseEvent(event)
                        }}
                        className="flex w-full items-start gap-3 rounded-[14px] px-3 py-3 text-left transition-colors hover:bg-surface-container-low"
                      >
                        <Icon name="event" className="mt-0.5 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-body-md font-medium text-on-surface">{event.name}</span>
                          <span className="mt-0.5 block text-label-sm text-muted">
                            {[formatEventDate(event.event_date), event.location].filter(Boolean).join(' · ') ||
                              'Sem data ou local definidos'}
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-4 text-center text-body-md text-muted">
                      Nenhum evento parecido foi encontrado.
                    </p>
                  )}
                </div>
              )}
            </Field>
          ) : (
            selectedEvent && <EventSummary event={selectedEvent} />
          )}

          {selectedEvent && events.length > 1 && (
            <p className="flex items-start gap-2 rounded-[14px] bg-primary-fixed/30 p-3 text-label-md text-on-surface">
              <Icon name="check_circle" filled className="shrink-0 text-primary" />
              <span>Evento selecionado: <strong>{eventDescription(selectedEvent)}</strong></span>
            </p>
          )}

          <Field
            label="Onde você está agora?"
            error={errors.location}
            htmlFor="attendance-location"
            icon="location_on"
            hint="Texto livre para validação do ambiente."
          >
            <input
              id="attendance-location"
              className="field field-icon"
              value={location}
              maxLength={160}
              onChange={(event) => {
                setLocation(event.target.value)
                clearError('location')
              }}
              placeholder="Ex.: Auditório principal, sala 2"
            />
          </Field>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5" aria-labelledby="details-title">
          <StepTitle
            id="details-title"
            title="Seus dados"
            description="Preencha as informações que constarão na lista."
          />
          <Field label="Nome completo" error={errors.fullName} htmlFor="fullName" icon="person">
            <input
              id="fullName"
              className="field field-icon"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value)
                clearError('fullName')
              }}
              autoComplete="name"
              placeholder="João Silva"
            />
          </Field>
          <Field label="CPF" error={errors.cpf} htmlFor="cpf" icon="badge" hint="Apenas números">
            <input
              id="cpf"
              className="field field-icon tabular-nums"
              value={cpf}
              onChange={(event) => {
                setCpf(maskCpf(event.target.value))
                clearError('cpf')
              }}
              inputMode="numeric"
              placeholder="000.000.000-00"
            />
          </Field>
          <Field label="E-mail" error={errors.email} htmlFor="email" icon="mail">
            <input
              id="email"
              type="email"
              className="field field-icon"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                clearError('email')
              }}
              autoComplete="email"
              placeholder="voce@email.com"
            />
          </Field>
          <Field label="Telefone" error={errors.phone} htmlFor="phone" icon="call" hint="Opcional">
            <input
              id="phone"
              className="field field-icon tabular-nums"
              value={phone}
              onChange={(event) => {
                setPhone(maskPhone(event.target.value))
                clearError('phone')
              }}
              inputMode="tel"
              autoComplete="tel"
              placeholder="(00) 00000-0000"
            />
          </Field>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5" aria-labelledby="signature-title">
          <StepTitle
            id="signature-title"
            title="Sua assinatura"
            description="Assine como faria em uma lista de presença física."
          />
          <div className="rounded-[14px] bg-surface-container-low p-4 text-label-md text-on-surface-variant">
            <p className="font-semibold text-on-surface">{selectedEvent?.name}</p>
            <p className="mt-1">{fullName} · {location.trim()}</p>
          </div>
          <SignaturePad
            disabled={submitting}
            error={errors.signature}
            onChange={(value) => {
              setSignature(value)
              clearError('signature')
            }}
          />
        </section>
      )}

      {formError && <p role="alert" className="alert-error">{formError}</p>}

      <div className="flex gap-3 pt-1">
        {step > 1 && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setStep((step - 1) as Step)}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border px-5 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
          >
            <Icon name="arrow_back" />
            Voltar
          </button>
        )}
        <button type="submit" className="btn-primary flex-1" disabled={submitting}>
          {submitting ? 'Registrando…' : step === 3 ? 'Confirmar presença' : 'Continuar'}
          <Icon
            name={submitting ? 'progress_activity' : step === 3 ? 'check' : 'arrow_forward'}
            className={submitting ? 'animate-spin' : ''}
          />
        </button>
      </div>
    </form>
  )
}

function eventScore(event: PublicEvent, rawQuery: string) {
  if (!rawQuery.trim()) return 0
  const query = normalize(rawQuery)
  const name = normalize(event.name)
  const description = normalize(eventDescription(event))
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(query)) return 2
  if (description.includes(query)) return 3

  const eventTokens = description.split(' ')
  let totalDistance = 0
  const resembles = query.split(' ').every((queryToken) => {
    const best = Math.min(
      ...eventTokens.map((eventToken) =>
        eventToken.startsWith(queryToken) ? 0 : editDistance(queryToken, eventToken)
      )
    )
    totalDistance += best
    return best <= Math.max(1, Math.floor(queryToken.length * 0.34))
  })
  return resembles ? 4 + totalDistance : Number.POSITIVE_INFINITY
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j]
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      diagonal = above
    }
  }
  return row[b.length]
}

function messageForError(code?: string) {
  if (code === '23505') return 'Você já registrou presença neste evento.'
  if (code === '23514') return 'Confira os campos e a assinatura.'
  if (code === '42501') return 'Este evento não está mais aberto.'
  if (code === 'P0001') return 'Este evento atingiu o limite de participantes. Procure a organização.'
  return 'Não foi possível registrar sua presença. Tente novamente.'
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label={`Etapa ${current} de 3`}>
      {['Evento', 'Dados', 'Assinatura'].map((label, index) => {
        const number = (index + 1) as Step
        const done = number < current
        return (
          <li key={label} className="min-w-0 text-center">
            <span className={`mx-auto flex size-8 items-center justify-center rounded-full text-label-sm font-bold ${
              number === current
                ? 'bg-primary text-on-primary'
                : done
                  ? 'bg-secondary-fixed text-on-secondary-fixed'
                  : 'bg-surface-container-high text-muted'
            }`}>
              {done ? <Icon name="check" className="text-[18px]" /> : number}
            </span>
            <span className={`mt-1 block truncate text-label-sm ${number === current ? 'text-primary' : 'text-muted'}`}>
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function StepTitle({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <header>
      <h3 id={id} className="font-display text-title-lg text-on-surface">{title}</h3>
      <p className="mt-1 text-body-md text-muted">{description}</p>
    </header>
  )
}

function EventSummary({ event }: { event: PublicEvent }) {
  return (
    <div className="rounded-card border border-border bg-surface-container-low p-4">
      <p className="flex items-center gap-2 text-label-sm uppercase tracking-wider text-muted">
        <Icon name="event" className="text-[18px]" />
        Evento
      </p>
      <p className="mt-2 text-body-lg font-semibold text-on-surface">{event.name}</p>
      <p className="mt-1 text-label-md text-on-surface-variant">
        {[formatEventDate(event.event_date), event.location].filter(Boolean).join(' · ') ||
          'Sem data ou local definidos'}
      </p>
    </div>
  )
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
      <label htmlFor={htmlFor} className="block text-label-md text-on-surface">{label}</label>
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
