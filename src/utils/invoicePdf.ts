import init, { WasmDocumentBuilder } from 'pdf-oxide-wasm/web'
import type { Invoice } from '../data/types'
import { formatDate, formatMoney } from '../data/utils'

/** Ensure WASM exports are loaded before constructing builders. */
let pdfOxideReady: Promise<unknown> | null = null

function ensurePdfOxide() {
  if (!pdfOxideReady) {
    // The /bundler entry does not wire WASM under Vite production builds.
    // /web's init() fetches the .wasm (Vite rewrites the asset URL in the build).
    pdfOxideReady = init()
  }
  return pdfOxideReady
}

export interface InvoicePdfContext {
  tenantName: string
  tenantEmail: string
  tenantPhone: string
  buildingName: string
  buildingAddress: string
  unitNumber: string
  landlordName: string
  rent: number
  deposit: number
}

const BRAND = 'REAL ESTATE CRM'
const AGENCY_EMAIL = 'billing@realestatecrm.local'
const AGENCY_PHONE = '+27 21 555 0100'
const BANK_ACCOUNT = '6284 0173 92'
const BANK_ACC_NAME = 'Property Trust Account'
const BANK_DETAILS = 'FNB · Branch 250655'

/** Soft modern palette (RGB 0–1) */
const C = {
  header: [0.06, 0.32, 0.31] as const, // deep teal
  ink: [0.1, 0.17, 0.16] as const,
  muted: [0.35, 0.43, 0.42] as const,
  line: [0.82, 0.86, 0.85] as const,
  tableHead: [0.9, 0.94, 0.93] as const,
  totalBar: [0.84, 0.93, 0.91] as const,
  footer: [0.42, 0.55, 0.58] as const,
  white: [1, 1, 1] as const,
  softBg: [0.97, 0.98, 0.97] as const,
}

const PAGE_W = 595.27
const PAGE_H = 841.89
const MARGIN = 40

function shortInvoiceNo(id: string) {
  const digits = id.replace(/\D/g, '')
  if (digits.length >= 4) return digits.slice(-4)
  return id.replace(/^inv-?/i, '').slice(0, 8).toUpperCase() || '0001'
}

function clip(text: string, max: number) {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

type Page = ReturnType<WasmDocumentBuilder['a4Page']>

function drawText(
  page: Page,
  x: number,
  y: number,
  text: string,
  font: string,
  size: number,
  color: readonly [number, number, number] = C.ink,
) {
  page.font(font, size)
  page.at(x, y)
  page.inlineColor(color[0], color[1], color[2], text)
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    { type: 'application/pdf' },
  )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Create and download a single-page modern PDF invoice using PDF Oxide DocumentBuilder. */
export async function generateInvoicePdf(invoice: Invoice, ctx: InvoicePdfContext) {
  await ensurePdfOxide()
  const invoiceNo = shortInvoiceNo(invoice.id)
  const builder = new WasmDocumentBuilder()
  builder.title(`Invoice ${invoiceNo}`)
  builder.author(BRAND)
  builder.creator('Real Estate CRM')

  const page = builder.a4Page()

  // Soft page wash
  page.filledRect(0, 0, PAGE_W, PAGE_H, C.softBg[0], C.softBg[1], C.softBg[2])

  // Header band
  page.filledRect(0, PAGE_H - 64, PAGE_W, 64, C.header[0], C.header[1], C.header[2])
  // Logo mark
  page.filledRect(MARGIN, PAGE_H - 48, 22, 22, C.white[0], C.white[1], C.white[2])
  drawText(page, MARGIN + 5, PAGE_H - 42, '◆', 'Helvetica-Bold', 12, C.header)
  drawText(page, MARGIN + 32, PAGE_H - 42, BRAND, 'Helvetica-Bold', 13, C.white)
  drawText(page, PAGE_W - MARGIN - 95, PAGE_H - 44, 'INVOICE', 'Helvetica-Bold', 22, C.white)

  // Invoice to
  let y = PAGE_H - 100
  drawText(page, MARGIN, y, 'Invoice to:', 'Helvetica-Bold', 10, C.muted)
  y -= 20
  drawText(page, MARGIN, y, clip(ctx.tenantName, 42), 'Helvetica-Bold', 16, C.ink)
  y -= 16
  drawText(
    page,
    MARGIN,
    y,
    clip(`${ctx.buildingAddress}, Unit ${ctx.unitNumber}`, 58),
    'Helvetica',
    9,
    C.muted,
  )
  y -= 13
  drawText(
    page,
    MARGIN,
    y,
    clip(`${ctx.buildingName}  ·  Landlord: ${ctx.landlordName}`, 58),
    'Helvetica',
    9,
    C.muted,
  )
  y -= 13
  drawText(
    page,
    MARGIN,
    y,
    clip(`${ctx.tenantEmail}  ·  ${ctx.tenantPhone}`, 58),
    'Helvetica',
    9,
    C.muted,
  )

  // Meta block (right)
  const metaX = 360
  let metaY = PAGE_H - 100
  const meta = [
    ['Invoice #', invoiceNo],
    ['Date', formatDate(invoice.issuedAt)],
    ['Due date', formatDate(invoice.dueDate)],
    ['Status', invoice.status],
  ] as const
  for (const [label, value] of meta) {
    drawText(page, metaX, metaY, label, 'Helvetica-Bold', 9, C.muted)
    drawText(page, metaX + 70, metaY, String(value), 'Helvetica', 9, C.ink)
    metaY -= 15
  }

  // Table
  const tableTop = PAGE_H - 210
  const colX = [MARGIN, MARGIN + 28, MARGIN + 250, MARGIN + 370, MARGIN + 430]
  const tableW = PAGE_W - MARGIN * 2

  page.filledRect(MARGIN, tableTop - 6, tableW, 24, C.tableHead[0], C.tableHead[1], C.tableHead[2])
  drawText(page, colX[0] + 4, tableTop, 'No.', 'Helvetica-Bold', 9, C.ink)
  drawText(page, colX[1], tableTop, 'Service Description', 'Helvetica-Bold', 9, C.ink)
  drawText(page, colX[2], tableTop, 'Price', 'Helvetica-Bold', 9, C.ink)
  drawText(page, colX[3], tableTop, 'Qty.', 'Helvetica-Bold', 9, C.ink)
  drawText(page, colX[4], tableTop, 'Total', 'Helvetica-Bold', 9, C.ink)

  let rowY = tableTop - 28
  const maxRows = Math.min(invoice.items.length, 6)
  for (let i = 0; i < maxRows; i++) {
    const item = invoice.items[i]
    const amount = formatMoney(item.amount)
    if (i % 2 === 1) {
      page.filledRect(MARGIN, rowY - 8, tableW, 22, 0.94, 0.96, 0.95)
    }
    page.strokeLine(
      MARGIN,
      rowY - 10,
      MARGIN + tableW,
      rowY - 10,
      0.5,
      C.line[0],
      C.line[1],
      C.line[2],
    )
    drawText(page, colX[0] + 4, rowY, String(i + 1), 'Helvetica', 9, C.ink)
    drawText(page, colX[1], rowY, clip(item.description, 38), 'Helvetica', 9, C.ink)
    drawText(page, colX[2], rowY, amount, 'Helvetica', 9, C.ink)
    drawText(page, colX[3] + 8, rowY, '1', 'Helvetica', 9, C.ink)
    drawText(page, colX[4], rowY, amount, 'Helvetica', 9, C.ink)
    rowY -= 26
  }

  // Terms + totals
  const blockY = Math.min(rowY - 20, PAGE_H - 420)
  drawText(page, MARGIN, blockY, 'Terms and Conditions', 'Helvetica-Bold', 11, C.header)
  const terms =
    invoice.notes?.trim() ||
    'Payment is due by the date shown. Use your unit number as payment reference. Late payments may attract interest as per the lease.'
  page.font('Helvetica', 8)
  page.textInRect(MARGIN, blockY - 95, 250, 90, terms, 0)

  const totalsX = 340
  let ty = blockY
  const lines = [
    ['Subtotal', formatMoney(invoice.total)],
    ['Shipping', formatMoney(0)],
    ['Tax', formatMoney(0)],
  ] as const
  for (const [label, value] of lines) {
    drawText(page, totalsX, ty, label, 'Helvetica-Bold', 10, C.ink)
    drawText(page, totalsX + 130, ty, value, 'Helvetica', 10, C.ink)
    ty -= 16
  }
  ty -= 6
  page.filledRect(totalsX - 8, ty - 10, 220, 28, C.totalBar[0], C.totalBar[1], C.totalBar[2])
  drawText(page, totalsX, ty, 'TOTAL', 'Helvetica-Bold', 12, C.header)
  drawText(page, totalsX + 110, ty, formatMoney(invoice.total), 'Helvetica-Bold', 12, C.header)

  // Contact + payment + sign
  const footY = 150
  drawText(page, MARGIN, footY + 48, 'Questions:', 'Helvetica-Bold', 10, C.header)
  drawText(page, MARGIN, footY + 34, `Email us: ${AGENCY_EMAIL}`, 'Helvetica', 8, C.muted)
  drawText(page, MARGIN, footY + 22, `Call us: ${AGENCY_PHONE}`, 'Helvetica', 8, C.muted)

  drawText(page, MARGIN, footY, 'Payment Info:', 'Helvetica-Bold', 10, C.header)
  drawText(page, MARGIN, footY - 14, `Account #:  ${BANK_ACCOUNT}`, 'Helvetica', 8, C.muted)
  drawText(page, MARGIN, footY - 26, `ACC Name:  ${BANK_ACC_NAME}`, 'Helvetica', 8, C.muted)
  drawText(page, MARGIN, footY - 38, `Bank Details:  ${BANK_DETAILS}`, 'Helvetica', 8, C.muted)

  // Signature
  drawText(page, 390, footY + 20, 'Agent Desk', 'Times-Italic', 18, C.header)
  page.strokeLine(370, footY + 8, 530, footY + 8, 0.8, C.line[0], C.line[1], C.line[2])
  drawText(page, 410, footY - 8, 'Authorised Sign', 'Helvetica-Bold', 9, C.muted)

  // Footer bar
  page.filledRect(0, 0, PAGE_W, 26, C.footer[0], C.footer[1], C.footer[2])
  drawText(
    page,
    MARGIN,
    10,
    `${BRAND}  ·  Unit ${ctx.unitNumber}  ·  Thank you`,
    'Helvetica',
    8,
    C.white,
  )

  page.done(builder)
  const bytes = builder.build()
  const safeName = ctx.tenantName.replace(/[^\w\-]+/g, '_').toLowerCase() || 'tenant'
  downloadBytes(bytes, `invoice-${safeName}-${invoiceNo}.pdf`)
}
