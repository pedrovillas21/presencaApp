'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/client'
import { maskCpf } from '@/lib/cpf'
import { maskPhone } from '@/lib/phone'
import { formatDateTime } from '@/lib/datetime'
import type { AttendeeRow } from '@/lib/types'

export default function AttendeeTable({ attendees }: { attendees: AttendeeRow[] }) {
  const router = useRouter()
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // Busca por nome, e-mail ou CPF — os três campos que o admin lê em voz alta
  // quando alguém reclama que não está na lista.
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return attendees
    const digits = term.replace(/\D/g, '')
    return attendees.filter(
      (a) =>
        a.full_name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        (digits.length > 0 && a.cpf.includes(digits))
    )
  }, [attendees, query])

  async function remove(attendee: AttendeeRow) {
    const ok = window.confirm(
      `Remover ${attendee.full_name} da lista de presença? Essa ação não pode ser desfeita.`
    )
    if (!ok) return

    setRemovingId(attendee.id)
    setError(null)
    const { error } = await createClient().from('attendees').delete().eq('id', attendee.id)
    setRemovingId(null)

    if (error) {
      setError('Não foi possível remover o participante.')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      <div className="flex flex-col overflow-hidden rounded-card border border-border bg-surface">
        <div className="flex flex-col items-center justify-between gap-4 border-b border-border bg-surface-bright p-6 sm:flex-row">
          <h2 className="font-display text-headline-md text-on-surface">Lista de Participantes</h2>
          <div className="relative w-full sm:w-72">
            <Icon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar participante…"
              aria-label="Buscar participante"
              className="h-12 w-full rounded-full border border-border bg-surface pl-12 pr-4 text-body-md outline-none transition-colors hover:border-outline-variant focus:border-primary"
            />
          </div>
        </div>

        {attendees.length === 0 ? (
          <EmptyState
            icon="person_off"
            title="Ninguém registrou presença neste evento ainda."
            hint="Abra a lista e compartilhe o formulário público para começar."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="search_off"
            title={`Nenhum participante encontrado para “${query.trim()}”.`}
            hint="Tente parte do nome, o e-mail ou o CPF."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-container-lowest">
                  <Th>Nome</Th>
                  <Th>CPF</Th>
                  <Th className="hidden md:table-cell">E-mail</Th>
                  <Th className="hidden lg:table-cell">Telefone</Th>
                  <Th>Check-in</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-body-md">
                {visible.map((attendee) => (
                  <tr key={attendee.id} className="group transition-colors hover:bg-surface-container-low/50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={attendee.full_name} />
                        <span className="font-medium text-on-surface">{attendee.full_name}</span>
                      </div>
                    </Td>
                    <Td className="tabular-nums text-on-surface-variant">{maskCpf(attendee.cpf)}</Td>
                    <Td className="hidden text-on-surface-variant md:table-cell">{attendee.email}</Td>
                    <Td className="hidden tabular-nums text-on-surface-variant lg:table-cell">
                      {attendee.phone ? maskPhone(attendee.phone) : '—'}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-secondary" />
                        <span className="text-on-surface">{formatDateTime(attendee.created_at)}</span>
                      </span>
                    </Td>
                    <Td className="text-right">
                      <button
                        onClick={() => remove(attendee)}
                        disabled={removingId === attendee.id}
                        aria-label={`Remover ${attendee.full_name}`}
                        className="rounded-full p-2 text-muted transition-colors hover:bg-error-container hover:text-on-error-container focus:opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Icon name={removingId === attendee.id ? 'progress_activity' : 'delete'}
                          className={removingId === attendee.id ? 'animate-spin' : ''} />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {attendees.length > 0 && (
          <div className="border-t border-border bg-surface p-4">
            <span className="text-label-md text-muted">
              {visible.length === attendees.length
                ? `${attendees.length} ${attendees.length === 1 ? 'participante' : 'participantes'}`
                : `Mostrando ${visible.length} de ${attendees.length} participantes`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Iniciais em vez de foto: não temos avatar dos participantes. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-label-sm font-bold text-on-primary-fixed">
      {initials || '?'}
    </span>
  )
}

function EmptyState({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div className="p-12 text-center">
      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-surface-container">
        <Icon name={icon} className="text-[28px] text-muted" />
      </span>
      <p className="text-body-md text-on-surface-variant">{title}</p>
      <p className="mt-1 text-label-md text-muted">{hint}</p>
    </div>
  )
}

const Th = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <th className={`px-6 py-4 text-label-sm font-semibold uppercase tracking-wider text-muted ${className}`}>
    {children}
  </th>
)

const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-6 py-4 ${className}`}>{children}</td>
)
