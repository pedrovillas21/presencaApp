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
  created_at: string
}

// A4 retrato, margem 40pt → 515pt úteis.
const MARGIN = 40
const COL = { num: 25, name: 180, cpf: 80, phone: 75, sign: 155 }
const HEADERS = ['Nº', 'Nome completo', 'CPF', 'Telefone', 'Assinatura'] as const
const WIDTHS = [COL.num, COL.name, COL.cpf, COL.phone, COL.sign]

const ROW_H = 42 // espaço real para assinar à caneta
const TABLE_HEAD_H = 22
const CELL_PAD = 5
const NUM_PAD = 3 // colunas numéricas (CPF/telefone) são apertadas
const NUM_SIZE = 8.5

const INK = '#111111'
const MUTED = '#666666'
const WARN = '#b91c1c'
const LINE = '#999999'
const HEAD_BG = '#eeeeee'

/**
 * Reduz o corpo até o texto caber na largura, com piso. Nomes completos
 * brasileiros passam fácil de 40 caracteres e truncar o nome de alguém numa
 * lista de presença invalida o documento — encolher é melhor que cortar.
 */
function fitFontSize(doc: Doc, text: string, width: number, max: number, min: number) {
  let size = max
  while (size > min && doc.fontSize(size).widthOfString(text) > width) {
    size -= 0.25
  }
  doc.fontSize(size)
  return size
}

/** x inicial de cada coluna, a partir da margem esquerda. */
const colX = WIDTHS.reduce<number[]>((acc, w, i) => {
  acc.push(i === 0 ? MARGIN : acc[i - 1] + WIDTHS[i - 1])
  return acc
}, [])

const TABLE_LEFT = MARGIN
const TABLE_RIGHT = MARGIN + WIDTHS.reduce((a, b) => a + b, 0)

type Doc = PDFKit.PDFDocument

const hLine = (doc: Doc, y: number) => {
  doc
    .moveTo(TABLE_LEFT, y)
    .lineTo(TABLE_RIGHT, y)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke()
}

const vLines = (doc: Doc, top: number, bottom: number) => {
  doc.strokeColor(LINE).lineWidth(0.5)
  doc.moveTo(TABLE_LEFT, top).lineTo(TABLE_LEFT, bottom).stroke()
  colX.slice(1).forEach((x) => doc.moveTo(x, top).lineTo(x, bottom).stroke())
  doc.moveTo(TABLE_RIGHT, top).lineTo(TABLE_RIGHT, bottom).stroke()
}

/** Bloco de título — só na primeira página. */
function drawReportHeader(doc: Doc, event: EventRow, listed: number, total: number): number {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18)
  doc.text('LISTA DE PRESENÇA', MARGIN, MARGIN, { width: TABLE_RIGHT - MARGIN })

  const subtitle = [event.name, formatDateOnly(event.event_date), event.location]
    .filter(Boolean)
    .join('  ·  ')

  doc.moveDown(0.35)
  doc.font('Helvetica').fontSize(11).fillColor(INK)
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

  // Documento assinável não pode mentir sobre o que não está nele: se a lista
  // saiu truncada, isso precisa estar impresso na cara da primeira página.
  if (listed < total) {
    const warnY = infoY + 16
    doc.font('Helvetica-Bold').fontSize(9).fillColor(WARN)
    doc.text(
      `Lista truncada: exibindo ${listed} de ${total} registros.`,
      MARGIN,
      warnY,
      { width: TABLE_RIGHT - MARGIN, lineBreak: false }
    )
    doc.font('Helvetica')
    return warnY + 22
  }

  return infoY + 22
}

/** Cabeçalho da tabela — repetido em toda página. Devolve o y do topo da 1ª linha. */
function drawTableHeader(doc: Doc, y: number): number {
  doc
    .rect(TABLE_LEFT, y, TABLE_RIGHT - TABLE_LEFT, TABLE_HEAD_H)
    .fillColor(HEAD_BG)
    .fill()

  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
  HEADERS.forEach((label, i) => {
    doc.text(label, colX[i] + CELL_PAD, y + 7, {
      width: WIDTHS[i] - CELL_PAD * 2,
      align: i === 0 ? 'center' : 'left',
      lineBreak: false,
    })
  })

  hLine(doc, y)
  hLine(doc, y + TABLE_HEAD_H)
  vLines(doc, y, y + TABLE_HEAD_H)

  return y + TABLE_HEAD_H
}

function drawRow(doc: Doc, y: number, index: number, a: AttendeeRow) {
  const bottom = y + ROW_H

  doc.font('Helvetica').fontSize(9).fillColor(INK)
  doc.text(String(index).padStart(2, '0'), colX[0] + 2, y + ROW_H / 2 - 5, {
    width: WIDTHS[0] - 4,
    align: 'center',
    lineBreak: false,
  })

  const nameWidth = WIDTHS[1] - CELL_PAD * 2
  doc.fillColor(INK)
  fitFontSize(doc, a.full_name, nameWidth, 10, 6)
  doc.text(a.full_name, colX[1] + CELL_PAD, y + 9, {
    width: nameWidth,
    height: 14,
    ellipsis: true,
    lineBreak: false,
  })

  doc.fillColor(MUTED)
  fitFontSize(doc, a.email, nameWidth, 7.5, 5.5)
  doc.text(a.email, colX[1] + CELL_PAD, y + 24, {
    width: nameWidth,
    height: 12,
    ellipsis: true,
    lineBreak: false,
  })

  // CPF e telefone mascarados quase preenchem a coluna: com padding de 5pt e
  // 9pt de fonte, "(11) 98765-4321" (66,5pt) não cabe nos 65pt restantes e
  // quebra em duas linhas. Padding menor + corpo 8,5 dão folga.
  doc.fontSize(NUM_SIZE).fillColor(INK)
  doc.text(maskCpf(a.cpf), colX[2] + NUM_PAD, y + ROW_H / 2 - 5, {
    width: WIDTHS[2] - NUM_PAD * 2,
    height: 12,
    ellipsis: true,
    lineBreak: false,
  })
  doc.text(maskPhone(a.phone), colX[3] + NUM_PAD, y + ROW_H / 2 - 5, {
    width: WIDTHS[3] - NUM_PAD * 2,
    height: 12,
    ellipsis: true,
    lineBreak: false,
  })

  // coluna de assinatura fica em branco, de propósito

  hLine(doc, bottom)
  vLines(doc, y, bottom)
}

/** Rodapé de todas as páginas — escrito no fim, quando o total já é conhecido. */
function drawFooters(doc: Doc, event: EventRow) {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)

    // O rodapé fica abaixo da margem inferior e o PDFKit, ao escrever texto ali,
    // acrescentaria uma página nova a cada chamada. Zerar a margem enquanto
    // escreve é o jeito suportado de evitar isso.
    const bottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0

    const y = doc.page.height - 32
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    doc.text(event.name, MARGIN, y, {
      width: (TABLE_RIGHT - MARGIN) / 2,
      ellipsis: true,
      lineBreak: false,
    })
    doc.text(
      `Página ${i + 1} de ${range.count}`,
      MARGIN + (TABLE_RIGHT - MARGIN) / 2,
      y,
      { width: (TABLE_RIGHT - MARGIN) / 2, align: 'right', lineBreak: false }
    )

    doc.page.margins.bottom = bottomMargin
  }
}

/**
 * Monta o PDF e faz pipe direto no destino (a response). O pipe é ligado antes
 * de desenhar para o stream fluir em vez de acumular tudo em memória.
 * Paginação é manual: o PDFKit não pode inserir página sozinho no meio de uma
 * linha da tabela.
 */
export function buildAttendanceReport(
  event: EventRow,
  attendees: AttendeeRow[],
  dest: NodeJS.WritableStream,
  /** Total de participantes no evento — maior que `attendees` se houve corte. */
  total: number = attendees.length
): Doc {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `Lista de presença — ${event.name}`,
      Author: 'presencaApp',
    },
  })

  doc.pipe(dest)

  const limitY = () => doc.page.height - 50 // espaço do rodapé

  let y = drawReportHeader(doc, event, attendees.length, total)
  y = drawTableHeader(doc, y)

  if (attendees.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED)
    doc.text('Nenhum participante registrado neste evento.', MARGIN, y + 14, {
      width: TABLE_RIGHT - MARGIN,
      align: 'center',
      lineBreak: false,
    })
  }

  attendees.forEach((attendee, i) => {
    if (y + ROW_H > limitY()) {
      doc.addPage()
      y = drawTableHeader(doc, MARGIN)
    }
    drawRow(doc, y, i + 1, attendee)
    y += ROW_H
  })

  drawFooters(doc, event)
  doc.end()
  return doc
}
