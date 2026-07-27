export type StageId =
  | 'inquiry'
  | 'documents'
  | 'kyc'
  | 'payment'
  | 'lease'
  | 'completion'
  | 'movein'

export type StagePhase = 'intake' | 'review' | 'legal' | 'closing'

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
  },
  {
    id: 'documents',
    number: 2,
    title: 'Applicant Details & Documents',
    shortTitle: 'Documents',
    description:
      'Applicant provides income, monthly expenses, supporting documents, and check consent.',
    phase: 'intake',
    editorRole: 'applicant',
    editorLabel: 'Applicant / Tenant only',
  },
  {
    id: 'kyc',
    number: 3,
    title: 'KYC Report',
    shortTitle: 'KYC',
    description:
      'Review the identity and credit check results, then agent and landlord approve.',
    phase: 'review',
    editorRole: 'shared',
    editorLabel: 'Agent & Landlord',
  },
  {
    id: 'payment',
    number: 4,
    title: 'Payment Request',
    shortTitle: 'Payment',
    description:
      'Tenant pays deposit, rent, and admin fees using the rental unit banking details, then uploads proof.',
    phase: 'review',
    editorRole: 'applicant',
    editorLabel: 'Applicant / Tenant',
  },
  {
    id: 'lease',
    number: 5,
    title: 'Lease Agreement Signing',
    shortTitle: 'Lease',
    description:
      'Applicant, landlord, and agent review and sign the lease PDF online.',
    phase: 'legal',
    editorRole: 'shared',
    editorLabel: 'All parties',
  },
  {
    id: 'completion',
    number: 6,
    title: 'Application Complete',
    shortTitle: 'Complete',
    description: 'Confirm the rental application process is finished and ready for move-in.',
    phase: 'closing',
    editorRole: 'agent',
    editorLabel: 'Agent / Realtor',
  },
  {
    id: 'movein',
    number: 7,
    title: 'Move-in Inspection',
    shortTitle: 'Move-in',
    description:
      'Record the condition of the apartment before the tenant moves in for comparison at move-out.',
    phase: 'closing',
    editorRole: 'agent',
    editorLabel: 'Agent / Realtor',
  },
]
