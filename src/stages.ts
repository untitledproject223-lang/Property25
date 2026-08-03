export type StageId =
  | 'inquiry'
  | 'documents'
  | 'kycFees'
  | 'kyc'
  | 'payment'
  | 'lease'
  | 'completion'
  | 'movein'

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
    id: 'completion',
    number: 7,
    title: 'Application Complete',
    shortTitle: 'Complete',
    description: 'Confirm the rental application process is finished and ready for move-in.',
    phase: 'closing',
    editorRole: 'agent',
    editorLabel: 'Agent / Realtor',
    canEdit: ['admin', 'agent'],
  },
  {
    id: 'movein',
    number: 8,
    title: 'Move-in Inspection',
    shortTitle: 'Move-in',
    description:
      'Record the condition of the apartment before the tenant moves in for comparison at move-out.',
    phase: 'closing',
    editorRole: 'shared',
    editorLabel: 'Agent, tenant & landlord',
    canEdit: ['admin', 'agent', 'tenant', 'landlord'],
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
  return data[key] === true
}

/** Shared steps need every party to finish their part before the stage unlocks the next. */
export function pendingPartiesForStage(
  stageId: StageId,
  formData: Record<string, unknown>,
): PortalRole[] {
  if (stageId === 'lease') {
    const pending: PortalRole[] = []
    if (!bool(formData, 'signApplicantDone')) pending.push('tenant')
    if (!bool(formData, 'signLandlordDone')) pending.push('landlord')
    if (!bool(formData, 'signAgentDone')) pending.push('agent')
    return pending
  }
  if (stageId === 'movein') {
    const pending: PortalRole[] = []
    if (!bool(formData, 'inspectionTenantSigned')) pending.push('tenant')
    if (!bool(formData, 'inspectionLandlordSigned')) pending.push('landlord')
    if (!bool(formData, 'inspectionAgentSigned')) pending.push('agent')
    return pending
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
    return pendingPartiesForStage(stageId, formData).length === 0
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
    return { stage, waitingOn: pendingPartiesForStage(stage.id, formData) }
  }
  return {
    stage,
    waitingOn: stage.canEdit.filter((r) => r !== 'admin'),
  }
}
