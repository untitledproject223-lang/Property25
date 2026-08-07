import { z } from 'zod'

const clauseIdSchema = z.enum([
  'noticePeriod',
  'pets',
  'smoking',
  'subletting',
  'parking',
  'occupancyGuests',
  'alterations',
  'utilitiesPrepaid',
  'earlyTermination',
  'gardenCommon',
  'bodyCorporate',
  'insurance',
])

export const leaseConfigSchema = z.object({
  mode: z.enum(['template', 'upload']),
  selectedClauseIds: z.array(clauseIdSchema).default([]),
  clauseParams: z
    .object({
      noticeMonths: z.number().int().positive().optional(),
      petsAllowed: z.boolean().optional(),
      petsNote: z.string().max(500).optional(),
      parkingBay: z.string().max(200).optional(),
      maxOccupants: z.number().int().positive().optional(),
      earlyTerminationMonths: z.number().int().positive().optional(),
      earlyTerminationFee: z.string().max(120).optional(),
    })
    .default({}),
  customClauses: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(8000),
      }),
    )
    .default([]),
  leasePdfName: z.string().max(260).optional().nullable(),
  leasePdfDataUrl: z.string().max(12_000_000).optional().nullable(),
})

export type LeaseConfigInput = z.infer<typeof leaseConfigSchema>

export function normalizeLeaseConfig(raw: unknown): LeaseConfigInput | null {
  const parsed = leaseConfigSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
