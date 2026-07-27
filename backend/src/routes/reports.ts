import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { slugify } from '../lib/format'
import { todayIsoInTz } from '../lib/datetime'
import {
  buildAttendanceReport,
  type AttendeeRow,
  type EventRow,
} from '../pdf/attendanceReport'

const router = Router()
const paramsSchema = z.object({ eventId: z.string().uuid() })

/**
 * Teto de linhas por relatório. O PDFKit monta a árvore do documento em memória
 * antes de drenar o stream, então uma tabela inundada derrubaria o container
 * (512 MB no free tier do Render) em vez de gerar um PDF. O schema já limita
 * participantes por evento; isto é a segunda barreira, para o caso de o limite
 * do evento ter sido afrouxado à mão.
 */
const REPORT_ROW_LIMIT = 2000

router.get('/events/:eventId/report.pdf', requireAuth, async (req, res) => {
  const parsed = paramsSchema.safeParse(req.params)
  if (!parsed.success) {
    return res.status(400).json({ error: 'ID de evento inválido.' })
  }
  const { eventId } = parsed.data

  // As duas queries passam pela RLS com o JWT do próprio admin.
  const { data: event, error: eventError } = await req.supabase
    .from('events')
    .select('id, name, event_date, location')
    .eq('id', eventId)
    .maybeSingle<EventRow>()

  if (eventError) {
    console.error('Erro ao buscar evento:', eventError)
    return res.status(500).json({ error: 'Erro ao consultar o evento.' })
  }
  if (!event) {
    return res.status(404).json({ error: 'Evento não encontrado.' })
  }

  // count exato + limit: o cabeçalho precisa do total real do evento, mesmo
  // quando o corpo da lista sai truncado.
  const {
    data: attendees,
    count,
    error: attendeesError,
  } = await req.supabase
    .from('attendees')
    .select('full_name, cpf, email, phone, attendance_location, signature_data, created_at', { count: 'exact' })
    .eq('event_id', eventId)
    .order('full_name')
    .limit(REPORT_ROW_LIMIT)
    .returns<AttendeeRow[]>()

  if (attendeesError) {
    console.error('Erro ao buscar participantes:', attendeesError)
    return res.status(500).json({ error: 'Erro ao consultar os participantes.' })
  }

  const rows = attendees ?? []
  const total = count ?? rows.length

  const filename = `lista-presenca-${slugify(event.name)}-${todayIsoInTz()}.pdf`

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  const doc = buildAttendanceReport(event, rows, res, total)
  doc.on('error', (err) => {
    console.error('Erro ao gerar PDF:', err)
    res.destroy()
  })
})

export default router
