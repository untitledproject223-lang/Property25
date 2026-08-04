export type StageId =
  | 'inquiry'
  | 'documents'
  | 'kycFees'
  | 'kyc'
  | 'payment'
  | 'lease'
  | 'movein'
  | 'success'

export type StagePhase = 'intake' | 'review' | 'legal' | 'closing'

export type PortalRole = 'admin' | 'agent' | 'tenant' | 'landlord'

export type EditorRole = 'agent' | 'applicant' | 'internal' | 'shared'

export interface StageDefinition {
  id: StageId
  number: number
  title: string
  shortTitle: string
  description: string
  phase: StagePhase
  editorRole?: EditorRole
  editorLabel?: string
  /** Roles that may edit this stage (others are view-only). */
  canEdit: PortalRole[]
}

export const STAGES: StageDefinition[] = [
  {
    id: 'inquiry',
    number: 1,
    title: 'Inquiry & Application Details',
    shortTitle: 'Inquiry',
    description:
      'Agent captures who is applying and the apartment details for this application.',
    phase: 'intake',
    editorRole: 'agent',
    editorLabel: 'Agent / Realtor only',
    canEdit: ['admin', 'agent'],
  },
  {
    id: 'documents',
    number: 2,
    title: 'Applicant Details & Documents',
    shortTitle: 'Documents',
    description:
      'Applicant provides income, optional monthly expenses, supporting documents, and check consent.',
    phase: 'intake',
    editorRole: 'applicant',
    editorLabel: 'Applicant / Tenant only',
    canEdit: ['tenant'],
  },
  {
    id: 'kycFees',
    number: 3,
    title: 'KYC Check Admin Fees',
    shortTitle: 'KYC Fees',
    description:
      'Tenant pays the admin fee for the KYC / credit check using the rental unit banking details, then uploads proof.',
    phase: 'review',
    editorRole: 'applicant',
    editorLabel: 'Applicant / Tenant',
    canEdit: ['tenant'],
  },
  {
    id: 'kyc',
    number: 4,
    title: 'KYC Report',
    shortTitle: 'KYC',
    description: 'Agent reviews identity and credit check results and approves proceeding.',
    phase: 'review',
    editorRole: 'agent',
    editorLabel: 'Agent / Realtor only',
    canEdit: ['admin', 'agent'],
  },
  {
    id: 'payment',
    number: 5,
    title: 'Payment Request',
    shortTitle: 'Payment',
    description:
      'Tenant pays deposit, rent, and admin fees using the rental unit banking details, then uploads proof.',
    phase: 'review',
    editorRole: 'applicant',
    editorLabel: 'Applicant / Tenant',
    canEdit: ['tenant'],
  },
  {
    id: 'lease',
    number: 6,
    title: 'Lease Agreement Signing',
    shortTitle: 'Lease',
    description:
      'Applicant, landlord, and agent review and sign the lease PDF online.',
    phase: 'legal',
    editorRole: 'shared',
    editorLabel: 'All parties',
    canEdit: ['admin', 'agent', 'tenant', 'landlord'],
  },
  {
    id: 'movein',
    number: 7,
    title: 'Move-in Inspection',
    shortTitle: 'Move-in',
    description:
      'Record the condition of the apartment before the tenant moves in for comparison at move-out.',
    phase: 'closing',
    editorRole: 'shared',
    editorLabel: 'Agent, tenant & landlord',
    canEdit: ['admin', 'agent', 'tenant', 'landlord'],
  },
  {
    id: 'success',
    number: 8,
    title: 'Application Successful',
    shortTitle: 'Success',
    description:
      'The rental application is complete. All parties can confirm success and return to their dashboard.',
    phase: 'closing',
    editorRole: 'shared',
    editorLabel: 'All parties · view only',
    canEdit: [],
  },
]

export function canEditStage(stageId: StageId, role: PortalRole | undefined): boolean {
  if (!role) return false
  const stage = STAGES.find((s) => s.id === stageId)
  return stage ? stage.canEdit.includes(role) : false
}

/** Human-readable party labels for progress UI. */
export function partyLabel(role: PortalRole): string {
  if (role === 'admin' || role === 'agent') return 'Agent'
  if (role === 'tenant') return 'Tenant'
  return 'Landlord'
}

export function formatPartyList(roles: PortalRole[]): string {
  const unique = Array.from(
    new Set(roles.map((r) => (r === 'admin' ? 'agent' : r) as PortalRole)),
  )
  const labels = unique.map(partyLabel)
  if (labels.length === 0) return 'someone'
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

function bool(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return value === true || value === 'true' || value === 1 || value === '1'
}

export type PartySignStatus = {
  role: PortalRole
  label: string
  done: boolean
  nameKey: string
  doneKey: string
}

export function leaseSignatureStatuses(
  formData: Record<string, unknown>,
): PartySignStatus[] {
  return [
    {
      role: 'tenant',
      label: 'Tenant',
      done: bool(formData, 'signApplicantDone'),
      nameKey: 'signApplicantName',
      doneKey: 'signApplicantDone',
    },
    {
      role: 'landlord',
      label: 'Landlord',
      done: bool(formData, 'signLandlordDone'),
      nameKey: 'signLandlordName',
      doneKey: 'signLandlordDone',
    },
    {
      role: 'agent',
      label: 'Agent',
      done: bool(formData, 'signAgentDone'),
      nameKey: 'signAgentName',
      doneKey: 'signAgentDone',
    },
  ]
}

export function moveInSignStatuses(
  formData: Record<string, unknown>,
): PartySignStatus[] {
  return [
    {
      role: 'tenant',
      label: 'Tenant',
      done: bool(formData, 'inspectionTenantSigned'),
      nameKey: 'inspectionTenantSigned',
      doneKey: 'inspectionTenantSigned',
    },
    {
      role: 'landlord',
      label: 'Landlord',
      done: bool(formData, 'inspectionLandlordSigned'),
      nameKey: 'inspectionLandlordSigned',
      doneKey: 'inspectionLandlordSigned',
    },
    {
      role: 'agent',
      label: 'Agent',
      done: bool(formData, 'inspectionAgentSigned'),
      nameKey: 'inspectionAgentSigned',
      doneKey: 'inspectionAgentSigned',
    },
  ]
}

/** Normalize admin → agent for shared-step party keys. */
export function sharedPartyRole(role: PortalRole | undefined): 'tenant' | 'landlord' | 'agent' | null {
  if (!role) return null
  if (role === 'tenant') return 'tenant'
  if (role === 'landlord') return 'landlord'
  if (role === 'admin' || role === 'agent') return 'agent'
  return null
}

function advanceKeyFor(
  stageId: 'lease' | 'movein',
  party: 'tenant' | 'landlord' | 'agent',
): string {
  if (stageId === 'lease') {
    if (party === 'tenant') return 'leaseNextTenant'
    if (party === 'landlord') return 'leaseNextLandlord'
    return 'leaseNextAgent'
  }
  if (party === 'tenant') return 'moveinNextTenant'
  if (party === 'landlord') return 'moveinNextLandlord'
  return 'moveinNextAgent'
}

export function partyHasSigned(
  stageId: 'lease' | 'movein',
  formData: Record<string, unknown>,
  role: PortalRole | undefined,
): boolean {
  const party = sharedPartyRole(role)
  if (!party) return false
  if (stageId === 'lease') {
    if (party === 'tenant') {
      return (
        bool(formData, 'signApplicantDone') &&
        Boolean(String(formData.signApplicantName ?? '').trim()) &&
        Boolean(String(formData.signApplicantDate ?? '').trim()) &&
        Boolean(String(formData.signApplicantMark ?? '').trim())
      )
    }
    if (party === 'landlord') {
      return (
        bool(formData, 'signLandlordDone') &&
        Boolean(String(formData.signLandlordName ?? '').trim()) &&
        Boolean(String(formData.signLandlordDate ?? '').trim()) &&
        Boolean(String(formData.signLandlordMark ?? '').trim())
      )
    }
    return (
      bool(formData, 'signAgentDone') &&
      Boolean(String(formData.signAgentName ?? '').trim()) &&
      Boolean(String(formData.signAgentDate ?? '').trim()) &&
      Boolean(String(formData.signAgentMark ?? '').trim())
    )
  }
  if (party === 'tenant') return bool(formData, 'inspectionTenantSigned')
  if (party === 'landlord') return bool(formData, 'inspectionLandlordSigned')
  return bool(formData, 'inspectionAgentSigned')
}

export function partyHasAdvanced(
  stageId: 'lease' | 'movein',
  formData: Record<string, unknown>,
  role: PortalRole | undefined,
): boolean {
  const party = sharedPartyRole(role)
  if (!party) return false
  return bool(formData, advanceKeyFor(stageId, party))
}

/** Mark that this party clicked Next / Complete after signing. */
export function markPartyAdvanced(
  stageId: 'lease' | 'movein',
  formData: Record<string, unknown>,
  role: PortalRole | undefined,
): Record<string, unknown> {
  const party = sharedPartyRole(role)
  if (!party) return formData
  return { ...formData, [advanceKeyFor(stageId, party)]: true }
}

/** Parties that still need to complete their signature block. */
export function pendingSignaturesForStage(
  stageId: StageId,
  formData: Record<string, unknown>,
): PortalRole[] {
  if (stageId === 'lease') {
    const pending: PortalRole[] = []
    if (!partyHasSigned('lease', formData, 'tenant')) pending.push('tenant')
    if (!partyHasSigned('lease', formData, 'landlord')) pending.push('landlord')
    if (!partyHasSigned('lease', formData, 'agent')) pending.push('agent')
    return pending
  }
  if (stageId === 'movein') {
    const pending: PortalRole[] = []
    if (!partyHasSigned('movein', formData, 'tenant')) pending.push('tenant')
    if (!partyHasSigned('movein', formData, 'landlord')) pending.push('landlord')
    if (!partyHasSigned('movein', formData, 'agent')) pending.push('agent')
    return pending
  }
  return []
}

/**
 * Parties that still need to click Next (step 6) or Complete (step 8).
 * Stage unlocks only after every party has advanced — not merely signed.
 */
export function pendingAdvanceForStage(
  stageId: StageId,
  formData: Record<string, unknown>,
): PortalRole[] {
  if (stageId === 'lease') {
    const pending: PortalRole[] = []
    if (!partyHasAdvanced('lease', formData, 'tenant')) pending.push('tenant')
    if (!partyHasAdvanced('lease', formData, 'landlord')) pending.push('landlord')
    if (!partyHasAdvanced('lease', formData, 'agent')) pending.push('agent')
    return pending
  }
  if (stageId === 'movein') {
    const pending: PortalRole[] = []
    if (!partyHasAdvanced('movein', formData, 'tenant')) pending.push('tenant')
    if (!partyHasAdvanced('movein', formData, 'landlord')) pending.push('landlord')
    if (!partyHasAdvanced('movein', formData, 'agent')) pending.push('agent')
    return pending
  }
  return []
}

/** @deprecated Prefer pendingSignaturesForStage / pendingAdvanceForStage. */
export function pendingPartiesForStage(
  stageId: StageId,
  formData: Record<string, unknown>,
): PortalRole[] {
  if (stageId === 'lease' || stageId === 'movein') {
    return pendingAdvanceForStage(stageId, formData)
  }
  const stage = STAGES.find((s) => s.id === stageId)
  return stage ? [...stage.canEdit.filter((r) => r !== 'admin')] : []
}

export function isStageFullyComplete(
  stageId: StageId,
  completed: Set<StageId>,
  formData: Record<string, unknown>,
): boolean {
  if (stageId === 'lease' || stageId === 'movein') {
    // All parties must sign and click Next — not signature-only.
    return pendingAdvanceForStage(stageId, formData).length === 0
  }
  if (stageId === 'success') {
    // Success is reached once move-in is finished by all parties.
    return pendingAdvanceForStage('movein', formData).length === 0
  }
  return completed.has(stageId)
}

/** Index of the first stage that still blocks progress (or last if all done). */
export function activeStageIndex(
  completed: Set<StageId>,
  formData: Record<string, unknown>,
): number {
  const idx = STAGES.findIndex((s) => !isStageFullyComplete(s.id, completed, formData))
  return idx === -1 ? STAGES.length - 1 : idx
}

export function isStageReachable(
  index: number,
  completed: Set<StageId>,
  formData: Record<string, unknown>,
): boolean {
  return index <= activeStageIndex(completed, formData)
}

/** Who is currently holding up the overall process. */
export function progressHolders(
  completed: Set<StageId>,
  formData: Record<string, unknown>,
): { stage: StageDefinition; waitingOn: PortalRole[] } | null {
  const index = STAGES.findIndex((s) => !isStageFullyComplete(s.id, completed, formData))
  if (index === -1) return null
  const stage = STAGES[index]
  if (stage.id === 'lease' || stage.id === 'movein') {
    return { stage, waitingOn: pendingAdvanceForStage(stage.id, formData) }
  }
  if (stage.id === 'success') {
    return null
  }
  return {
    stage,
    waitingOn: stage.canEdit.filter((r) => r !== 'admin'),
  }
}
