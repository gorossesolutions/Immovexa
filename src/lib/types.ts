export type PropertyType = "apartment" | "house" | "office" | "commercial" | "land" | "other";
export type PropertyStatus = "vacant" | "occupied" | "maintenance" | "archived";
export type Currency = "MUR" | "EUR" | "USD";
export type OwnershipScheme = "freehold" | "irs" | "res" | "pds" | "ghs" | "none";
export type UnitScope = "entire_property" | "floor_only" | "room_only";

export interface Property {
  id: string;
  organization_id: string;
  reference: string;
  address_line: string;
  city: string;
  region: string | null;
  postal_code: string | null;
  property_type: PropertyType;
  surface_area: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  furnished: boolean;
  status: PropertyStatus;
  ownership_scheme: OwnershipScheme | null;
  floor_level: string | null;
  unit_number: string | null;
  unit_scope: UnitScope;
  currency: Currency;
  description: string | null;
  parent_property_id: string | null;
  commission_rate: number | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyOwner {
  id: string;
  property_id: string;
  owner_id: string;
  ownership_percentage: number | null;
  full_name: string;
}

export interface PropertyPhoto {
  id: string;
  property_id: string;
  file_path: string;
  position: number;
  created_at: string;
}

export type CommercialStatus =
  | "sold"
  | "under_offer"
  | "for_sale"
  | "rented_long_term"
  | "short_term_active"
  | "no_active_listing";

export interface PropertyCommercialStatus {
  property_id: string;
  commercial_status: CommercialStatus;
}

export type ListingType = "sale" | "long_term_rental" | "short_term_rental";
export type ListingStatus = "draft" | "active" | "under_offer" | "closed" | "archived";

export interface Listing {
  id: string;
  organization_id: string;
  property_id: string;
  listing_type: ListingType;
  status: ListingStatus;
  price: number | null;
  monthly_rent: number | null;
  nightly_rate: number | null;
  currency: Currency;
  commission_rate: number | null;
  created_at: string;
}

export type SaleStatus = "offer" | "compromis" | "deed_pending" | "completed" | "cancelled";

export interface Sale {
  id: string;
  organization_id: string;
  listing_id: string;
  buyer_name: string;
  buyer_contact: string | null;
  offer_price: number | null;
  agreed_price: number | null;
  status: SaleStatus;
  compromis_date: string | null;
  deed_date: string | null;
  notary_name: string | null;
  commission_amount: number | null;
  notes: string | null;
  created_at: string;
}

export type BookingStatus = "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type BookingSource = "direct" | "airbnb" | "booking_com" | "other";

export interface ShortTermBooking {
  id: string;
  organization_id: string;
  listing_id: string;
  property_id: string;
  guest_name: string;
  guest_contact: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  nightly_rate: number;
  total_amount: number;
  deposit_amount: number | null;
  amount_paid: number;
  status: BookingStatus;
  source: BookingSource;
  created_at: string;
}

export interface OwnerOption {
  id: string;
  full_name: string;
}

export interface TenantOption {
  id: string;
  full_name: string;
}

export type LeaseStatus = "draft" | "active" | "ended" | "terminated";
export type LeaseType = "residential" | "commercial" | "seasonal";
export type RenewalType = "fixed" | "tacit_renewal";

export interface Lease {
  id: string;
  organization_id: string;
  property_id: string;
  status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  rent_amount: number;
  charges_amount: number;
  deposit_amount: number | null;
  payment_day: number;
  lease_type: LeaseType;
  renewal_type: RenewalType;
  notes: string | null;
  created_at: string;
}

export interface LeaseTenant {
  id: string;
  lease_id: string;
  tenant_id: string;
  is_primary: boolean;
}

export type DocumentEntityType = "property" | "lease" | "payment" | "tenant" | "owner" | "maintenance" | "organization";
export type DocumentCategory =
  | "lease_contract"
  | "id_document"
  | "inventory_checkin"
  | "inventory_checkout"
  | "receipt"
  | "invoice"
  | "diagnostic"
  | "insurance"
  | "other";
export type DocumentVisibility = "admin_only" | "owner_shared" | "tenant_shared" | "shared";

export interface DocumentRow {
  id: string;
  organization_id: string;
  entity_type: DocumentEntityType;
  entity_id: string;
  category: DocumentCategory;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  visibility: DocumentVisibility;
  created_at: string;
}

export type MaintenancePriority = "low" | "normal" | "high" | "urgent";
export type MaintenanceStatus = "open" | "in_progress" | "resolved" | "closed";

export interface MaintenanceRequest {
  id: string;
  organization_id: string;
  property_id: string;
  lease_id: string | null;
  reported_by: string;
  title: string;
  description: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface BrandingSettings {
  id: string;
  organization_id: string;
  display_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  neutral_color: string;
  font_family: string;
  updated_at: string;
}

export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "other";

export interface BillingAccount {
  id: string;
  organization_id: string;
  owner_entity_type: string;
  owner_entity_id: string;
  currency: string;
  created_at: string;
}

export type ChargeCategory = "rent" | "late_fee" | "deposit" | "service_charge" | "other";
export type ChargeStatus = "open" | "partially_paid" | "paid" | "waived";

export interface Charge {
  id: string;
  organization_id: string;
  billing_account_id: string;
  charge_schedule_id: string | null;
  category: ChargeCategory;
  description: string | null;
  amount: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  status: ChargeStatus;
  created_at: string;
}

export interface ChargeBalance {
  charge_id: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
}

export interface Payment {
  id: string;
  organization_id: string;
  billing_account_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod | null;
  notes: string | null;
  created_at: string;
}

export type ContactCategory =
  | "plumber"
  | "electrician"
  | "locksmith"
  | "cleaner"
  | "gardener"
  | "painter"
  | "general_contractor"
  | "concierge"
  | "notary"
  | "land_surveyor"
  | "lawyer"
  | "insurance_agent"
  | "other";

export interface AddressBookContact {
  id: string;
  organization_id: string;
  category: ContactCategory;
  full_name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  insurance_expiry: string | null;
  notes: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
