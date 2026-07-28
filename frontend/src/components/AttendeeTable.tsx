'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/client'
import { maskCpf } from '@/lib/cpf'
import { maskPhone } from '@/lib/phone'
import { formatDateTime } from '@/lib/datetime'
import type { AttendeeRow } from '@/lib/types'

/** Quantos inscritos cabem em uma página da lista. */
const PAGE_SIZE = 15

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
  const [page, setPage] = useState(1)

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

  // Trocar de filtro volta para a primeira página: a página 5 do resultado
  // antigo quase nunca existe no novo.
  useEffect(() => setPage(1), [query, location, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  // Excluir linhas pode encolher o resultado; sem o clamp a página some.
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = visible.slice(pageStart, pageStart + PAGE_SIZE)

  const selectedOnPage = pageRows.filter((attendee) => selectedSet.has(attendee.id)).length
  const allPageSelected = pageRows.length > 0 && selectedOnPage === pageRows.length
  const somePageSelected = selectedOnPage > 0 && !allPageSelected
  const allFilteredSelected =
    visible.length > 0 && visible.every((attendee) => selectedSet.has(attendee.id))

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

  /** O cabeçalho age só sobre a página atual — selecionar 98 linhas invisíveis surpreende. */
  function toggleAllOnPage() {
    setSelectedIds((current) => {
      const next = new Set(current)
      pageRows.forEach((attendee) => {
        if (allPageSelected) next.delete(attendee.id)
        else next.add(attendee.id)
      })
      return Array.from(next)
    })
  }

  function selectAllFiltered() {
    setSelectedIds((current) => Array.from(new Set([...current, ...visible.map((a) => a.id)])))
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
        <div className="space-y-4 border-b border-border bg-surface-bright px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-display text-headline-sm text-on-surface md:text-headline-md">
                Lista de profissionais
                <span className="chip bg-primary-fixed font-semibold text-on-primary-fixed">
                  {attendees.length}
                </span>
              </h2>
              <p className="mt-1 text-label-md text-muted">
                {PAGE_SIZE} por página · selecione linhas para excluir em lote.
              </p>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-label-md text-primary transition-colors hover:bg-primary-fixed"
              >
                <Icon name="filter_alt_off" className="text-[18px]" />
                Limpar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_minmax(190px,0.7fr)_160px_160px]">
            <label>
              <span className="sr-only">Buscar profissional</span>
              <span className="relative block">
                <Icon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[20px] text-muted"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nome, e-mail ou CPF…"
                  className="h-11 w-full rounded-full border border-border bg-surface pl-11 pr-4 text-body-md outline-none transition-colors hover:border-outline-variant focus:border-primary"
                />
              </span>
            </label>

            <label>
              <span className="sr-only">Filtrar por local informado</span>
              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="h-11 w-full rounded-full border border-border bg-surface px-4 text-body-md text-on-surface outline-none transition-colors hover:border-outline-variant focus:border-primary"
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
                className="h-11 w-full rounded-full border border-border bg-surface px-4 text-body-md text-on-surface outline-none transition-colors hover:border-outline-variant focus:border-primary"
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
                className="h-11 w-full rounded-full border border-border bg-surface px-4 text-body-md text-on-surface outline-none transition-colors hover:border-outline-variant focus:border-primary"
              />
            </label>
          </div>

          {activeSelectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary-fixed-dim bg-primary-fixed/60 px-4 py-3">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-2 text-label-md font-semibold text-on-primary-fixed">
                  <Icon name="checklist" className="text-[20px]" />
                  {activeSelectedIds.length}{' '}
                  {activeSelectedIds.length === 1
                    ? 'inscrito selecionado'
                    : 'inscritos selecionados'}
                </span>
                {!allFilteredSelected && visible.length > pageRows.length && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    disabled={busy}
                    className="text-label-md font-semibold text-primary underline underline-offset-4 transition-colors hover:text-on-primary-fixed disabled:opacity-50"
                  >
                    Selecionar os {visible.length} resultados
                  </button>
                )}
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
          <>
            {/* Tabela a partir de md — abaixo disso vira lista de cards. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-container-lowest">
                    <Th className="w-12 pr-0">
                      <button
                        type="button"
                        onClick={toggleAllOnPage}
                        disabled={busy}
                        aria-label={
                          allPageSelected
                            ? 'Desmarcar profissionais desta página'
                            : 'Selecionar profissionais desta página'
                        }
                        aria-pressed={allPageSelected}
                        className="flex rounded p-1 text-primary transition-colors hover:bg-primary-fixed disabled:opacity-50"
                      >
                        <Icon
                          name={
                            allPageSelected
                              ? 'check_box'
                              : somePageSelected
                                ? 'indeterminate_check_box'
                                : 'check_box_outline_blank'
                          }
                        />
                      </button>
                    </Th>
                    <Th>Profissional</Th>
                    <Th className="w-44">CPF / Telefone</Th>
                    <Th className="w-56">Local informado</Th>
                    <Th className="w-40">Check-in</Th>
                    <Th className="w-24 text-right">Ações</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-body-md">
                  {pageRows.map((attendee) => (
                    <tr
                      key={attendee.id}
                      className={`group transition-colors ${
                        selectedSet.has(attendee.id)
                          ? 'bg-primary-fixed/40'
                          : 'hover:bg-surface-container-low/60'
                      }`}
                    >
                      <Td className="w-12 pr-0">
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
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-on-surface">
                              {attendee.full_name}
                            </span>
                            <span
                              className="block truncate text-label-md text-muted"
                              title={attendee.email}
                            >
                              {attendee.email}
                            </span>
                          </span>
                        </div>
                      </Td>
                      <Td className="tabular-nums">
                        <span className="block text-on-surface-variant">
                          {maskCpf(attendee.cpf)}
                        </span>
                        <span className="block text-label-md text-muted">
                          {attendee.phone ? maskPhone(attendee.phone) : '—'}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className="line-clamp-2 text-on-surface-variant"
                          title={attendee.attendance_location}
                        >
                          {attendee.attendance_location}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span className="size-2 shrink-0 rounded-full bg-primary" />
                          <span className="text-on-surface">
                            {formatDateTime(attendee.created_at)}
                          </span>
                        </span>
                      </Td>
                      <Td className="text-right">
                        <RowActions
                          attendee={attendee}
                          busy={busy}
                          removingId={removingId}
                          removingCpf={removingCpf}
                          onRemove={remove}
                          onRemoveEverywhere={removeEverywhere}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {pageRows.map((attendee) => (
                <li
                  key={attendee.id}
                  className={`px-4 py-4 ${selectedSet.has(attendee.id) ? 'bg-primary-fixed/40' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(attendee.id)}
                      onChange={() => toggleSelected(attendee.id)}
                      disabled={busy}
                      aria-label={`Selecionar ${attendee.full_name}`}
                      className="mt-1 size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-on-surface">{attendee.full_name}</p>
                      <p className="truncate text-label-md text-muted">{attendee.email}</p>

                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-label-md">
                        <Field label="CPF" value={maskCpf(attendee.cpf)} mono />
                        <Field
                          label="Telefone"
                          value={attendee.phone ? maskPhone(attendee.phone) : '—'}
                          mono
                        />
                        <Field label="Local informado" value={attendee.attendance_location} wide />
                        <Field
                          label="Check-in"
                          value={formatDateTime(attendee.created_at)}
                          wide
                        />
                      </dl>
                    </div>
                    <RowActions
                      attendee={attendee}
                      busy={busy}
                      removingId={removingId}
                      removingCpf={removingCpf}
                      onRemove={remove}
                      onRemoveEverywhere={removeEverywhere}
                      alwaysVisible
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {visible.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-label-md text-muted">
              Mostrando{' '}
              <strong className="font-semibold text-on-surface">
                {pageStart + 1}–{pageStart + pageRows.length}
              </strong>{' '}
              de <strong className="font-semibold text-on-surface">{visible.length}</strong>{' '}
              {visible.length === 1 ? 'profissional' : 'profissionais'}
              {visible.length !== attendees.length && ` (de ${attendees.length} no total)`}
            </span>

            {totalPages > 1 && (
              <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  return (
    <nav aria-label="Paginação da lista" className="flex items-center gap-1 self-end sm:self-auto">
      <PageArrow
        icon="chevron_left"
        label="Página anterior"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      />

      {pageItems(page, totalPages).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-label-md text-muted">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
            className={`h-9 min-w-9 rounded-full px-2 text-label-md tabular-nums transition-colors ${
              item === page
                ? 'bg-primary font-bold text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            {item}
          </button>
        )
      )}

      <PageArrow
        icon="chevron_right"
        label="Próxima página"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      />
    </nav>
  )
}

function PageArrow({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full border border-border text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon name={icon} className="text-[20px]" />
    </button>
  )
}

/** Janela deslizante: primeira, última, atual e vizinhas — o resto vira reticência. */
function pageItems(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

  const items: Array<number | 'gap'> = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(totalPages - 1, page + 1)

  if (start > 2) items.push('gap')
  for (let i = start; i <= end; i += 1) items.push(i)
  if (end < totalPages - 1) items.push('gap')
  items.push(totalPages)

  return items
}

function RowActions({
  attendee,
  busy,
  removingId,
  removingCpf,
  onRemove,
  onRemoveEverywhere,
  alwaysVisible = false,
}: {
  attendee: AttendeeRow
  busy: boolean
  removingId: string | null
  removingCpf: string | null
  onRemove: (attendee: AttendeeRow) => void
  onRemoveEverywhere: (attendee: AttendeeRow) => void
  alwaysVisible?: boolean
}) {
  const reveal = alwaysVisible ? '' : 'sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => onRemove(attendee)}
        disabled={busy}
        aria-label={`Remover ${attendee.full_name} somente deste evento`}
        title="Remover somente deste evento"
        className={`rounded-full p-2 text-muted transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50 ${reveal}`}
      >
        <Icon
          name={removingId === attendee.id ? 'progress_activity' : 'person_remove'}
          className={removingId === attendee.id ? 'animate-spin' : ''}
        />
      </button>
      <button
        type="button"
        onClick={() => onRemoveEverywhere(attendee)}
        disabled={busy}
        aria-label={`Excluir ${attendee.full_name} de todos os eventos`}
        title="Excluir de todos os eventos"
        className={`rounded-full p-2 text-error transition-colors hover:bg-error-container hover:text-on-error-container disabled:opacity-50 ${reveal}`}
      >
        <Icon
          name={removingCpf === attendee.cpf ? 'progress_activity' : 'delete_forever'}
          className={removingCpf === attendee.cpf ? 'animate-spin' : ''}
        />
      </button>
    </span>
  )
}

function Field({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string
  value: string
  mono?: boolean
  wide?: boolean
}) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-on-surface-variant ${mono ? 'tabular-nums' : ''}`}>{value}</dd>
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
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-label-sm font-bold text-on-primary-fixed">
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
    className={`px-4 py-3 text-label-sm font-semibold uppercase tracking-wider text-muted ${className}`}
  >
    {children}
  </th>
)

const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-4 py-3 ${className}`}>{children}</td>
)
