import type { Apartment, Tenant } from './types'

/** A unit is vacant when no active/notice tenant is assigned to it. */
export function isUnitVacant(apartmentId: string, tenants: Tenant[]) {
  return !tenants.some(
    (t) => t.apartmentId === apartmentId && (t.status === 'active' || t.status === 'notice'),
  )
}

export function vacantApartments(apartments: Apartment[], tenants: Tenant[]) {
  return apartments.filter((a) => isUnitVacant(a.id, tenants))
}
