export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  vacant: "Vacant",
  occupied: "Occupé",
  maintenance: "Maintenance",
  archived: "Archivé",
};

export const LEASE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  active: "Actif",
  ended: "Terminé",
  terminated: "Résilié",
};

export const CHARGE_STATUS_LABELS: Record<string, string> = {
  open: "Ouvert",
  partially_paid: "Partiel",
  paid: "Payé",
  waived: "Exonéré",
};

export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  resolved: "Résolu",
  closed: "Clôturé",
};

export const MAINTENANCE_PRIORITY_LABELS: Record<string, string> = {
  low: "Faible",
  normal: "Normale",
  high: "Élevée",
  urgent: "Urgente",
};

export const LISTING_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  active: "Active",
  under_offer: "Sous offre",
  closed: "Clôturée",
  archived: "Archivée",
};

export const LISTING_TYPE_LABELS: Record<string, string> = {
  sale: "Vente",
  long_term_rental: "Location longue durée",
  short_term_rental: "Location courte durée",
};

export const SALE_STATUS_LABELS: Record<string, string> = {
  offer: "Offre",
  compromis: "Compromis",
  deed_pending: "Acte en attente",
  completed: "Finalisée",
  cancelled: "Annulée",
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmée",
  checked_in: "Arrivée effectuée",
  checked_out: "Départ effectué",
  cancelled: "Annulée",
};

export const BOOKING_SOURCE_LABELS: Record<string, string> = {
  direct: "Directe",
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  other: "Autre",
};

export const COMMERCIAL_STATUS_LABELS: Record<string, string> = {
  sold: "Vendu",
  under_offer: "Sous offre",
  for_sale: "À vendre",
  rented_long_term: "Loué",
  short_term_active: "Location courte active",
  no_active_listing: "Sans annonce active",
};

// LISTING_STATUS_LABELS / SALE_STATUS_LABELS / BOOKING_STATUS_LABELS ne sont
// PAS fusionnés dans ALL_STATUS_LABELS : leurs clés ('draft', 'active',
// 'closed', 'archived', 'cancelled'...) entrent en collision avec celles de
// property/lease/maintenance, avec des accords grammaticaux différents
// ("Archivé" pour un bien vs "Archivée" pour une annonce). Les écrans
// listings/sales/bookings passent leur libellé explicitement à statusBadge().
const ALL_STATUS_LABELS: Record<string, string> = {
  ...PROPERTY_STATUS_LABELS,
  ...LEASE_STATUS_LABELS,
  ...CHARGE_STATUS_LABELS,
  ...MAINTENANCE_STATUS_LABELS,
};

export function statusLabel(status: string): string {
  return ALL_STATUS_LABELS[status] ?? status;
}
