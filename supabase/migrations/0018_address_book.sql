-- ============================================================
-- CARNET D'ADRESSES — contacts prestataires (plombier, notaire, etc.)
-- rattachés à une organisation. Staff-only, même pattern que les
-- autres tables admin (staff_all, pas d'accès owner/tenant).
-- ============================================================

create table address_book_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category text not null check (category in (
    'plumber','electrician','locksmith','cleaner','gardener','painter',
    'general_contractor','concierge','notary','land_surveyor','lawyer','insurance_agent','other'
  )),
  full_name text not null,
  company_name text,
  phone text,
  email text,
  license_number text,
  insurance_expiry date,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_address_book_contacts_org on address_book_contacts(organization_id);

alter table address_book_contacts enable row level security;

grant select, insert, update, delete on address_book_contacts to authenticated;

create policy "address_book_contacts_staff_all" on address_book_contacts
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );
