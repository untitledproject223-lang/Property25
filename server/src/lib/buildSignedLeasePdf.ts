import { renderPdfFromHtml } from 'html-pdf-lite'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { AppError } from '../middleware/error.js'

function asString(value: unknown) {
  return typeof value === 'string' ? value : value != null ? String(value) : ''
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  const trimmed = dataUrl.trim()
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(trimmed)
  if (!match) return null
  const mimeType = (match[1] || 'application/octet-stream').trim().toLowerCase()
  const isBase64 = Boolean(match[2])
  const payload = match[3] ?? ''
  try {
    if (isBase64) {
      return { mimeType, bytes: Uint8Array.from(Buffer.from(payload.replace(/\s/g, ''), 'base64')) }
    }
    return {
      mimeType,
      bytes: Uint8Array.from(Buffer.from(decodeURIComponent(payload), 'utf8')),
    }
  } catch {
    return null
  }
}

/** Replace or append a signature notice so the body PDF points to the signed page. */
export function withSignatureNoticeHtml(html: string): string {
  const notice = `
<section class="lease-sec lease-sign-block">
  <h2>Signature</h2>
  <p>This Agreement is executed electronically. The tenant and landlord signatures appear on the final page of this PDF.</p>
</section>`

  if (/lease-sign-block/i.test(html)) {
    return html.replace(
      /<section[^>]*class="[^"]*lease-sign-block[^"]*"[\s\S]*?<\/section>/i,
      notice,
    )
  }
  if (/<\/article>/i.test(html)) {
    return html.replace(/<\/article>/i, `${notice}</article>`)
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${notice}</body>`)
  }
  return `${html}${notice}`
}

async function appendSignaturePage(
  pdfBytes: Uint8Array,
  form: Record<string, unknown>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.addPage([595.28, 841.89])
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const ink = rgb(0.1, 0.1, 0.1)
  const muted = rgb(0.35, 0.35, 0.35)

  let y = 780
  page.drawText('EXECUTION / SIGNATURES', {
    x: 50,
    y,
    size: 16,
    font: fontBold,
    color: ink,
  })
  y -= 24
  page.drawText(
    'By signing electronically, each Party confirms they have read and agree to this Agreement.',
    { x: 50, y, size: 10, font, color: muted, maxWidth: 495 },
  )
  y -= 40

  const parties: Array<{
    title: string
    name: string
    date: string
    mark: string
  }> = [
    {
      title: 'Tenant',
      name: asString(form.signApplicantName) || asString(form.applicantName) || '—',
      date: asString(form.signApplicantDate),
      mark: asString(form.signApplicantMark),
    },
    {
      title: 'Landlord',
      name: asString(form.signLandlordName) || asString(form.landlordName) || '—',
      date: asString(form.signLandlordDate),
      mark: asString(form.signLandlordMark),
    },
  ]

  for (const party of parties) {
    page.drawText(party.title, { x: 50, y, size: 12, font: fontBold, color: ink })
    y -= 18
    page.drawText(`Name: ${party.name}`, { x: 50, y, size: 11, font, color: ink })
    y -= 16
    if (party.date) {
      page.drawText(`Date: ${party.date}`, { x: 50, y, size: 11, font, color: ink })
      y -= 16
    }

    if (party.mark.startsWith('data:image/')) {
      const parsed = parseDataUrl(party.mark)
      if (parsed) {
        try {
          const image =
            parsed.mimeType.includes('jpeg') || parsed.mimeType.includes('jpg')
              ? await doc.embedJpg(parsed.bytes)
              : await doc.embedPng(parsed.bytes)
          const maxW = 240
          const maxH = 90
          const scale = Math.min(maxW / image.width, maxH / image.height, 1)
          const w = image.width * scale
          const h = image.height * scale
          y -= h + 8
          page.drawRectangle({
            x: 50,
            y: y - 4,
            width: w + 8,
            height: h + 8,
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 1,
          })
          page.drawImage(image, { x: 54, y, width: w, height: h })
          y -= 28
        } catch {
          page.drawText('(Signature image could not be embedded)', {
            x: 50,
            y,
            size: 10,
            font,
            color: muted,
          })
          y -= 28
        }
      }
    } else {
      page.drawText('(Signature not captured)', {
        x: 50,
        y,
        size: 10,
        font,
        color: muted,
      })
      y -= 28
    }

    y -= 24
  }

  return doc.save()
}

async function htmlToPdfBytes(html: string): Promise<Uint8Array> {
  const pdf = await renderPdfFromHtml(withSignatureNoticeHtml(html))
  if (Buffer.isBuffer(pdf)) return new Uint8Array(pdf)
  if (pdf && typeof pdf === 'object' && 'byteLength' in pdf) {
    return new Uint8Array(pdf as ArrayBufferLike)
  }
  return new Uint8Array(Buffer.from(String(pdf)))
}

/**
 * Build a downloadable signed lease PDF from application form_json.
 * Template leases become PDF; uploaded PDFs get a signature page appended.
 */
export async function buildSignedLeasePdf(
  form: Record<string, unknown>,
): Promise<{ contentBase64: string; filename: string; mimeType: string; sizeBytes: number }> {
  const pdfDataUrl = asString(form.leasePdfDataUrl)
  const html = asString(form.leaseDocumentHtml)
  let basePdf: Uint8Array | null = null

  if (pdfDataUrl.startsWith('data:')) {
    const parsed = parseDataUrl(pdfDataUrl)
    if (!parsed || parsed.bytes.length === 0) {
      throw new AppError(404, 'Uploaded lease PDF could not be read')
    }
    basePdf = parsed.bytes
  } else if (html.trim()) {
    basePdf = await htmlToPdfBytes(html)
  }

  if (!basePdf) {
    throw new AppError(404, 'No lease agreement is available for this tenancy yet')
  }

  const signed = await appendSignaturePage(basePdf, form)
  const contentBase64 = Buffer.from(signed).toString('base64')
  return {
    contentBase64,
    filename: 'Lease-agreement-signed.pdf',
    mimeType: 'application/pdf',
    sizeBytes: signed.byteLength,
  }
}
