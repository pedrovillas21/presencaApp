import PDFDocument from 'pdfkit'
import { formatDateOnly, formatDateTime } from '../lib/datetime'
import { maskCpf, maskPhone } from '../lib/format'

export type EventRow = {
  id: string
  name: string
  event_date: string | null
  location: string | null
}

export type AttendeeRow = {
  full_name: string
  cpf: string
  email: string
  phone: string | null
  attendance_location: string
  signature_data: string | null
  created_at: string
}

type Doc = PDFKit.PDFDocument

// A4 retrato com 515 pt úteis.
const MARGIN = 40
const COL = { num: 24, participant: 160, cpf: 78, phone: 73, sign: 180 }
const HEADERS = ['Nº', 'Participante', 'CPF', 'Telefone', 'Assinatura'] as const
const WIDTHS = [COL.num, COL.participant, COL.cpf, COL.phone, COL.sign]
const ROW_H = 66
const TABLE_HEAD_H = 22
const CELL_PAD = 5
const NUM_PAD = 3
const INK = '#111111'
const MUTED = '#666666'
const WARN = '#b91c1c'
const LINE = '#999999'
const HEAD_BG = '#eeeeee'

const colX = WIDTHS.reduce<number[]>((positions, width, index) => {
  positions.push(index === 0 ? MARGIN : positions[index - 1] + WIDTHS[index - 1])
  return positions
}, [])
const TABLE_LEFT = MARGIN
const TABLE_RIGHT = MARGIN + WIDTHS.reduce((total, width) => total + width, 0)

function fitFontSize(doc: Doc, text: string, width: number, max: number, min: number) {
  let size = max
  while (size > min && doc.fontSize(size).widthOfString(text) > width) size -= 0.25
  doc.fontSize(size)
}

const hLine = (doc: Doc, y: number) => {
  doc.moveTo(TABLE_LEFT, y).lineTo(TABLE_RIGHT, y).strokeColor(LINE).lineWidth(0.5).stroke()
}

const vLines = (doc: Doc, top: number, bottom: number) => {
  doc.strokeColor(LINE).lineWidth(0.5)
  doc.moveTo(TABLE_LEFT, top).lineTo(TABLE_LEFT, bottom).stroke()
  colX.slice(1).forEach((x) => doc.moveTo(x, top).lineTo(x, bottom).stroke())
  doc.moveTo(TABLE_RIGHT, top).lineTo(TABLE_RIGHT, bottom).stroke()
}

function drawReportHeader(doc: Doc, event: EventRow, listed: number, total: number) {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18)
  doc.text('LISTA DE PRESENÇA', MARGIN, MARGIN, { width: TABLE_RIGHT - MARGIN })

  const subtitle = [event.name, formatDateOnly(event.event_date), event.location]
    .filter(Boolean)
    .join('  ·  ')
  doc.moveDown(0.35).font('Helvetica').fontSize(11).fillColor(INK)
  doc.text(subtitle, MARGIN, doc.y, { width: TABLE_RIGHT - MARGIN })

  const infoY = doc.y + 10
  doc.fontSize(9).fillColor(MUTED)
  doc.text(`Total de participantes: ${total}`, MARGIN, infoY, {
    width: (TABLE_RIGHT - MARGIN) / 2,
    lineBreak: false,
  })
  doc.text(
    `Gerado em ${formatDateTime(new Date().toISOString())}`,
    MARGIN + (TABLE_RIGHT - MARGIN) / 2,
    infoY,
    { width: (TABLE_RIGHT - MARGIN) / 2, align: 'right', lineBreak: false }
  )

  if (listed < total) {
    const warningY = infoY + 16
    doc.font('Helvetica-Bold').fontSize(9).fillColor(WARN)
    doc.text(`Lista truncada: exibindo ${listed} de ${total} registros.`, MARGIN, warningY, {
      width: TABLE_RIGHT - MARGIN,
      lineBreak: false,
    })
    return warningY + 22
  }
  return infoY + 22
}

function drawTableHeader(doc: Doc, y: number) {
  doc.rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, TABLE_HEAD_H).fillColor(HEAD_BG).fill()
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
  HEADERS.forEach((label, index) => {
    doc.text(label, colX[index] + CELL_PAD, y + 7, {
      width: WIDTHS[index] - CELL_PAD * 2,
      align: index === 0 ? 'center' : 'left',
      lineBreak: false,
    })
  })
  hLine(doc, y)
  hLine(doc, y + TABLE_HEAD_H)
  vLines(doc, y, y + TABLE_HEAD_H)
  return y + TABLE_HEAD_H
}

function drawParticipant(doc: Doc, attendee: AttendeeRow, y: number) {
  const width = WIDTHS[1] - CELL_PAD * 2
  doc.font('Helvetica').fillColor(INK)
  fitFontSize(doc, attendee.full_name, width, 9.5, 6)
  doc.text(attendee.full_name, colX[1] + CELL_PAD, y + 6, {
    width,
    height: 12,
    ellipsis: true,
    lineBreak: false,
  })

  doc.fillColor(MUTED)
  fitFontSize(doc, attendee.email, width, 7, 5.25)
  doc.text(attendee.email, colX[1] + CELL_PAD, y + 20, {
    width,
    height: 10,
    ellipsis: true,
    lineBreak: false,
  })

  const attendanceLocation = `Local: ${attendee.attendance_location}`
  fitFontSize(doc, attendanceLocation, width, 6.75, 5)
  doc.text(attendanceLocation, colX[1] + CELL_PAD, y + 34, {
    width,
    height: 10,
    ellipsis: true,
    lineBreak: false,
  })

  const checkIn = `Check-in: ${formatDateTime(attendee.created_at)}`
  fitFontSize(doc, checkIn, width, 6.5, 5)
  doc.text(checkIn, colX[1] + CELL_PAD, y + 48, {
    width,
    height: 10,
    ellipsis: true,
    lineBreak: false,
  })
}

function drawSignature(doc: Doc, signature: string | null, y: number) {
  const x = colX[4] + CELL_PAD
  const width = WIDTHS[4] - CELL_PAD * 2
  const height = ROW_H - CELL_PAD * 2

  if (signature?.startsWith('data:image/png;base64,')) {
    try {
      const bytes = Buffer.from(signature.slice(signature.indexOf(',') + 1), 'base64')
      doc.image(bytes, x, y + CELL_PAD, { fit: [width, height], align: 'center', valign: 'center' })
      return
    } catch {
      // Registro malformado ou legado: o relatório continua e marca a ausência.
    }
  }

  doc.font('Helvetica-Oblique').fontSize(7).fillColor(MUTED)
  doc.text('Sem assinatura digital', x, y + ROW_H / 2 - 4, {
    width,
    align: 'center',
    lineBreak: false,
  })
}

function drawRow(doc: Doc, y: number, index: number, attendee: AttendeeRow) {
  const bottom = y + ROW_H
  doc.font('Helvetica').fontSize(8.5).fillColor(INK)
  doc.text(String(index).padStart(2, '0'), colX[0] + 2, y + ROW_H / 2 - 5, {
    width: WIDTHS[0] - 4,
    align: 'center',
    lineBreak: false,
  })

  drawParticipant(doc, attendee, y)
  doc.font('Helvetica').fontSize(8.25).fillColor(INK)
  doc.text(maskCpf(attendee.cpf), colX[2] + NUM_PAD, y + ROW_H / 2 - 5, {
    width: WIDTHS[2] - NUM_PAD * 2,
    height: 12,
    ellipsis: true,
    lineBreak: false,
  })
  doc.text(maskPhone(attendee.phone), colX[3] + NUM_PAD, y + ROW_H / 2 - 5, {
    width: WIDTHS[3] - NUM_PAD * 2,
    height: 12,
    ellipsis: true,
    lineBreak: false,
  })
  drawSignature(doc, attendee.signature_data, y)
  hLine(doc, bottom)
  vLines(doc, y, bottom)
}

function drawFooters(doc: Doc, event: EventRow) {
  const range = doc.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index)
    const bottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    const y = doc.page.height - 32
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    doc.text(event.name, MARGIN, y, {
      width: (TABLE_RIGHT - MARGIN) / 2,
      ellipsis: true,
      lineBreak: false,
    })
    doc.text(`Página ${index + 1} de ${range.count}`, MARGIN + (TABLE_RIGHT - MARGIN) / 2, y, {
      width: (TABLE_RIGHT - MARGIN) / 2,
      align: 'right',
      lineBreak: false,
    })
    doc.page.margins.bottom = bottomMargin
  }
}

export function buildAttendanceReport(
  event: EventRow,
  attendees: AttendeeRow[],
  destination: NodeJS.WritableStream,
  total: number = attendees.length
): Doc {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: `Lista de presença — ${event.name}`, Author: 'presencaApp' },
  })
  doc.pipe(destination)

  let y = drawTableHeader(doc, drawReportHeader(doc, event, attendees.length, total))
  if (!attendees.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED)
    doc.text('Nenhum participante registrado neste evento.', MARGIN, y + 14, {
      width: TABLE_RIGHT - MARGIN,
      align: 'center',
      lineBreak: false,
    })
  }

  attendees.forEach((attendee, index) => {
    if (y + ROW_H > doc.page.height - 50) {
      doc.addPage()
      y = drawTableHeader(doc, MARGIN)
    }
    drawRow(doc, y, index + 1, attendee)
    y += ROW_H
  })

  drawFooters(doc, event)
  doc.end()
  return doc
}
