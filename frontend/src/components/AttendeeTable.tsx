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
  const [removingCpf, setRemovingCpf] = useState<string | null>(null)
  const [bulkRemoving, setBulkRemoving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const locations = useMemo(
    () =>
      Array.from(new Set(attendees.map((attendee) => attendee.attendance_location))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
    [attendees]
  )

  const hasFilters = Boolean(query || location || dateFrom || dateTo)
  const attendeeIds = useMemo(() => new Set(attendees.map((attendee) => attendee.id)), [attendees])
  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => attendeeIds.has(id)),
    [attendeeIds, selectedIds]
  )
  const selectedSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds])

  const visible = useMemo(() => {
    const term = normalizeSearch(query.trim())
    const digits = term.replace(/\D/g, '')

    return attendees.filter((attendee) => {
      const matchesText =
        !term ||
        normalizeSearch(attendee.full_name).includes(term) ||
        normalizeSearch(attendee.email).includes(term) ||
        normalizeSearch(attendee.attendance_location).includes(term) ||
        (digits.length > 0 && attendee.cpf.includes(digits))
      const matchesLocation = !location || attendee.attendance_location === location
      const checkInDate = saoPauloDateKey(attendee.created_at)
      const matchesStart = !dateFrom || checkInDate >= dateFrom
      const matchesEnd = !dateTo || checkInDate <= dateTo

      return matchesText && matchesLocation && matchesStart && matchesEnd
    })
  }, [attendees, dateFrom, dateTo, location, query])

  const selectedVisibleCount = visible.filter((attendee) => selectedSet.has(attendee.id)).length
  const allVisibleSelected = visible.length > 0 && selectedVisibleCount === visible.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  async function remove(attendee: AttendeeRow) {
    const ok = window.confirm(
      `Remover ${attendee.full_name} somente deste evento? Essa ação não pode ser desfeita.`
    )
    if (!ok) return

    setRemovingId(attendee.id)
    setError(null)
    setSuccess(null)
    const { error } = await createClient().from('attendees').delete().eq('id', attendee.id)
    setRemovingId(null)

    if (error) {
      setError(`Não foi possível remover a presença: ${error.message}`)
      return
    }
    setSelectedIds((current) => current.filter((id) => id !== attendee.id))
    router.refresh()
  }

  async function removeEverywhere(attendee: AttendeeRow) {
    const ok = window.confirm(
      `Excluir ${attendee.full_name} de TODOS os eventos? Todas as presenças vinculadas ao CPF ${maskCpf(attendee.cpf)} serão apagadas permanentemente do banco de dados.`
    )
    if (!ok) return

    setRemovingCpf(attendee.cpf)
    setError(null)
    setSuccess(null)

    const { data, error } = await createClient().rpc('delete_professional_cascade', {
      p_cpf: attendee.cpf,
    })

    setRemovingCpf(null)

    if (error) {
      setError(`Não foi possível excluir o profissional: ${error.message}`)
      return
    }

    const deleted = typeof data === 'number' ? data : Number(data ?? 0)
    setSuccess(
      `${attendee.full_name} foi excluído do banco: ${deleted} ${
        deleted === 1 ? 'presença removida' : 'presenças removidas'
      }.`
    )
    setSelectedIds((current) => current.filter((id) => id !== attendee.id))
    router.refresh()
  }

  async function removeSelected() {
    if (activeSelectedIds.length === 0) return

    const ok = window.confirm(
      `Excluir ${activeSelectedIds.length} ${
        activeSelectedIds.length === 1 ? 'inscrito selecionado' : 'inscritos selecionados'
      } deste evento? Essa ação apagará os registros do banco e não pode ser desfeita.`
    )
    if (!ok) return

    setBulkRemoving(true)
    setError(null)
    setSuccess(null)

    const { error, count } = await createClient()
      .from('attendees')
      .delete({ count: 'exact' })
      .in('id', activeSelectedIds)

    setBulkRemoving(false)

    if (error) {
      setError(`Não foi possível excluir os inscritos selecionados: ${error.message}`)
      return
    }

    const deleted = count ?? activeSelectedIds.length
    setSelectedIds([])
    setSuccess(
      `${deleted} ${deleted === 1 ? 'inscrito foi excluído' : 'inscritos foram excluídos'} deste evento.`
    )
    router.refresh()
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    )
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)
      visible.forEach((attendee) => {
        if (allVisibleSelected) next.delete(attendee.id)
        else next.add(attendee.id)
      })
      return Array.from(next)
    })
  }

  function clearFilters() {
    setQuery('')
    setLocation('')
    setDateFrom('')
    setDateTo('')
  }

  const busy = removingId !== null || removingCpf !== null || bulkRemoving

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="alert-success">
          {success}
        </p>
      )}

      <div className="flex flex-col overflow-hidden rounded-card border border-border bg-surface">
        <div className="space-y-5 border-b border-border bg-surface-bright p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-headline-md text-on-surface">
                Lista de Profissionais
              </h2>
              <p className="mt-1 text-label-md text-muted">
                Selecione várias linhas para excluir em lote ou use as ações individuais.
              </p>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-label-md text-primary transition-colors hover:bg-primary-fixed"
              >
                <Icon name="filter_alt_off" className="text-[18px]" />
                Limpar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_minmax(200px,0.7fr)_170px_170px]">
            <label>
              <span className="sr-only">Buscar profissional</span>
              <span className="relative block">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nome, e-mail ou CPF…"
                  className="h-12 w-full rounded-full border border-border bg-surface pl-12 pr-4 text-body-md outline-none transition-colors hover:border-outline-variant focus:border-primary"
                />
              </span>
            </label>

            <label>
              <span className="sr-only">Filtrar por local informado</span>
              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="h-12 w-full rounded-full border border-border bg-surface px-4 text-body-md text-on-surface outline-none transition-colors hover:border-outline-variant focus:border-primary"
              >
                <option value="">Todos os locais</option>
                {locations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="relative">
              <span className="pointer-events-none absolute -top-2 left-4 z-10 bg-surface-bright px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                De
              </span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
                aria-label="Check-in a partir de"
                className="h-12 w-full rounded-full border border-border bg-surface px-4 text-body-md text-on-surface outline-none transition-colors hover:border-outline-variant focus:border-primary"
              />
            </label>

            <label className="relative">
              <span className="pointer-events-none absolute -top-2 left-4 z-10 bg-surface-bright px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Até
              </span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                aria-label="Check-in até"
                className="h-12 w-full rounded-full border border-border bg-surface px-4 text-body-md text-on-surface outline-none transition-colors hover:border-outline-variant focus:border-primary"
              />
            </label>
          </div>

          {activeSelectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary-fixed-dim bg-primary-fixed/60 px-4 py-3">
              <span className="inline-flex items-center gap-2 text-label-md font-semibold text-on-primary-fixed">
                <Icon name="checklist" className="text-[20px]" />
                {activeSelectedIds.length}{' '}
                {activeSelectedIds.length === 1 ? 'inscrito selecionado' : 'inscritos selecionados'}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-full px-4 text-label-md text-on-primary-fixed-variant transition-colors hover:bg-surface/70 disabled:opacity-50"
                >
                  Desmarcar
                </button>
                <button
                  type="button"
                  onClick={removeSelected}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-error px-4 text-label-md font-semibold text-on-error transition-colors hover:bg-on-error-container disabled:opacity-50"
                >
                  <Icon
                    name={bulkRemoving ? 'progress_activity' : 'delete_sweep'}
                    className={bulkRemoving ? 'animate-spin text-[18px]' : 'text-[18px]'}
                  />
                  Excluir selecionados
                </button>
              </span>
            </div>
          )}
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
            title="Nenhum profissional corresponde aos filtros."
            hint="Ajuste a busca, o local ou o período de check-in."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-container-lowest">
                  <Th className="w-14">
                    <button
                      type="button"
                      onClick={toggleAllVisible}
                      disabled={busy}
                      aria-label={
                        allVisibleSelected
                          ? 'Desmarcar profissionais filtrados'
                          : 'Selecionar profissionais filtrados'
                      }
                      aria-pressed={allVisibleSelected}
                      className="rounded p-1 text-primary transition-colors hover:bg-primary-fixed disabled:opacity-50"
                    >
                      <Icon
                        name={
                          allVisibleSelected
                            ? 'check_box'
                            : someVisibleSelected
                              ? 'indeterminate_check_box'
                              : 'check_box_outline_blank'
                        }
                      />
                    </button>
                  </Th>
                  <Th>Nome</Th>
                  <Th>CPF</Th>
                  <Th className="hidden md:table-cell">E-mail</Th>
                  <Th className="hidden lg:table-cell">Telefone</Th>
                  <Th>Local informado</Th>
                  <Th>Check-in</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-body-md">
                {visible.map((attendee) => (
                  <tr
                    key={attendee.id}
                    className="group transition-colors hover:bg-surface-container-low/50"
                  >
                    <Td className="w-14">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(attendee.id)}
                        onChange={() => toggleSelected(attendee.id)}
                        disabled={busy}
                        aria-label={`Selecionar ${attendee.full_name}`}
                        className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                      />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={attendee.full_name} />
                        <span className="font-medium text-on-surface">{attendee.full_name}</span>
                      </div>
                    </Td>
                    <Td className="tabular-nums text-on-surface-variant">
                      {maskCpf(attendee.cpf)}
                    </Td>
                    <Td className="hidden text-on-surface-variant md:table-cell">
                      {attendee.email}
                    </Td>
                    <Td className="hidden tabular-nums text-on-surface-variant lg:table-cell">
                      {attendee.phone ? maskPhone(attendee.phone) : '—'}
                    </Td>
                    <Td className="max-w-48 text-on-surface-variant">
                      <span className="line-clamp-2">{attendee.attendance_location}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-secondary" />
                        <span className="text-on-surface">
                          {formatDateTime(attendee.created_at)}
                        </span>
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => remove(attendee)}
                          disabled={busy}
                          aria-label={`Remover ${attendee.full_name} somente deste evento`}
                          title="Remover somente deste evento"
                          className="rounded-full p-2 text-muted transition-colors hover:bg-surface-container hover:text-on-surface focus:opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Icon
                            name={removingId === attendee.id ? 'progress_activity' : 'person_remove'}
                            className={removingId === attendee.id ? 'animate-spin' : ''}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEverywhere(attendee)}
                          disabled={busy}
                          aria-label={`Excluir ${attendee.full_name} de todos os eventos`}
                          title="Excluir de todos os eventos"
                          className="rounded-full p-2 text-error transition-colors hover:bg-error-container hover:text-on-error-container focus:opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Icon
                            name={
                              removingCpf === attendee.cpf ? 'progress_activity' : 'delete_forever'
                            }
                            className={removingCpf === attendee.cpf ? 'animate-spin' : ''}
                          />
                        </button>
                      </span>
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
                ? `${attendees.length} ${attendees.length === 1 ? 'profissional' : 'profissionais'}`
                : `Mostrando ${visible.length} de ${attendees.length} profissionais`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const saoPauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function saoPauloDateKey(iso: string) {
  const parts = saoPauloDateFormatter.formatToParts(new Date(iso))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
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
  <th
    className={`px-6 py-4 text-label-sm font-semibold uppercase tracking-wider text-muted ${className}`}
  >
    {children}
  </th>
)

const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-6 py-4 ${className}`}>{children}</td>
)
