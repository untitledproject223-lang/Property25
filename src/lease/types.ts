export type LeaseMode = 'template' | 'upload'

export type ClauseId =
  | 'noticePeriod'
  | 'pets'
  | 'smoking'
  | 'subletting'
  | 'parking'
  | 'occupancyGuests'
  | 'alterations'
  | 'utilitiesPrepaid'
  | 'earlyTermination'
  | 'gardenCommon'
  | 'bodyCorporate'
  | 'insurance'

export type CustomLeaseClause = {
  id: string
  title: string
  body: string
}

export type LeaseClauseParams = {
  noticeMonths?: number
  petsAllowed?: boolean
  petsNote?: string
  parkingBay?: string
  maxOccupants?: number
  earlyTerminationMonths?: number
  earlyTerminationFee?: string
}

export type UnitLeaseConfig = {
  mode: LeaseMode
  selectedClauseIds: ClauseId[]
  clauseParams: LeaseClauseParams
  customClauses: CustomLeaseClause[]
  /** Filename or stored reference when mode is upload */
  leasePdfName?: string | null
  /** Optional data URL / content reference for uploaded PDF preview */
  leasePdfDataUrl?: string | null
}

export type LeaseComposeFacts = {
  landlordName: string
  landlordEmail?: string
  landlordPhone?: string
  tenantName: string
  tenantEmail?: string
  tenantPhone?: string
  propertyAddress: string
  unitNumber: string
  rent: string
  deposit: string
  leaseStart: string
  leaseEnd: string
  agreementTermLabel: string
  today: string
  tenantSignatureMark?: string
  tenantSignatureDate?: string
  landlordSignatureMark?: string
  landlordSignatureDate?: string
}

export function emptyLeaseConfig(): UnitLeaseConfig {
  return {
    mode: 'template',
    selectedClauseIds: [],
    clauseParams: {},
    customClauses: [],
    leasePdfName: null,
    leasePdfDataUrl: null,
  }
}

export function parseLeaseConfig(raw: unknown): UnitLeaseConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const mode = obj.mode === 'upload' ? 'upload' : obj.mode === 'template' ? 'template' : null
  if (!mode) return null
  const selectedClauseIds = Array.isArray(obj.selectedClauseIds)
    ? (obj.selectedClauseIds.filter((id): id is ClauseId => typeof id === 'string') as ClauseId[])
    : []
  const clauseParams =
    obj.clauseParams && typeof obj.clauseParams === 'object' && !Array.isArray(obj.clauseParams)
      ? (obj.clauseParams as LeaseClauseParams)
      : {}
  const customClauses = Array.isArray(obj.customClauses)
    ? obj.customClauses
        .filter((c): c is CustomLeaseClause => {
          if (!c || typeof c !== 'object') return false
          const row = c as Record<string, unknown>
          return (
            typeof row.id === 'string' &&
            typeof row.title === 'string' &&
            typeof row.body === 'string'
          )
        })
        .map((c) => ({
          id: c.id,
          title: c.title.trim(),
          body: c.body.trim(),
        }))
        .filter((c) => c.title && c.body)
    : []
  return {
    mode,
    selectedClauseIds,
    clauseParams,
    customClauses,
    leasePdfName: typeof obj.leasePdfName === 'string' ? obj.leasePdfName : null,
    leasePdfDataUrl: typeof obj.leasePdfDataUrl === 'string' ? obj.leasePdfDataUrl : null,
  }
}
