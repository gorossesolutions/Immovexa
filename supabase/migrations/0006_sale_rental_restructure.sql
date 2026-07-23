-- ============================================================
-- RESTRUCTURATION VENTE / LOCATION (section 3 du complément v1.1)
-- ============================================================

alter table properties drop column monthly_rent;
alter table properties drop column deposit_amount;
alter table properties add column ownership_scheme text
  check (ownership_scheme in ('freehold','irs','res','pds','ghs','none'));

create table listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  listing_type text not null check (listing_type in ('sale','long_term_rental','short_term_rental')),
  status text not null default 'draft' check (status in ('draft','active','under_offer','closed','archived')),
  price numeric,
  monthly_rent numeric,
  nightly_rate numeric,
  currency text not null default 'MUR',
  commission_rate numeric,
  created_at timestamptz not null default now()
);

create index idx_listings_org on listings(organization_id);
create index idx_listings_property on listings(property_id);

create table sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  buyer_name text not null,
  buyer_contact text,
  offer_price numeric,
  agreed_price numeric,
  status text not null default 'offer' check (status in ('offer','compromis','deed_pending','completed','cancelled')),
  compromis_date date,
  deed_date date,
  notary_name text,
  commission_amount numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_sales_org on sales(organization_id);
create index idx_sales_listing on sales(listing_id);

alter table leases add column listing_id uuid references listings(id);

create table short_term_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  guest_name text not null,
  guest_contact text,
  check_in date not null,
  check_out date not null,
  nights integer generated always as (check_out - check_in) stored,
  nightly_rate numeric not null,
  total_amount numeric not null,
  deposit_amount numeric,
  amount_paid numeric not null default 0,
  status text not null default 'confirmed' check (status in ('confirmed','checked_in','checked_out','cancelled')),
  source text default 'direct' check (source in ('direct','airbnb','booking_com','other')),
  created_at timestamptz not null default now()
);

create index idx_bookings_org on short_term_bookings(organization_id);
create index idx_bookings_listing on short_term_bookings(listing_id);
create index idx_bookings_property on short_term_bookings(property_id);

-- ============================================================
-- RLS — non détaillée dans le complément v1.1, ajoutée ici en suivant
-- exactement le même pattern staff_all / owner_read que le reste du
-- schéma (section 4 de SPEC.md). Signalé explicitement : ce n'est pas
-- une simplification, juste l'application du pattern déjà établi à ces
-- 3 nouvelles tables, sans quoi elles seraient inutilisables (RLS activée
-- + zéro policy = accès refusé à tous les rôles non-superuser).
-- ============================================================

alter table listings enable row level security;
alter table sales enable row level security;
alter table short_term_bookings enable row level security;

create policy "listings_staff_all" on listings
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "listings_owner_read" on listings
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select owned_property_ids())
  );

create policy "sales_staff_all" on sales
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "sales_owner_read" on sales
  for select using (
    (current_profile()).role = 'owner'
    and listing_id in (select id from listings where property_id in (select owned_property_ids()))
  );

create policy "short_term_bookings_staff_all" on short_term_bookings
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "short_term_bookings_owner_read" on short_term_bookings
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select owned_property_ids())
  );

-- GRANT de base requis en plus de la RLS (cf. migration 0003) : sans ça,
-- l'accès est refusé avant même que la RLS soit évaluée.
grant select, insert, update, delete on listings, sales, short_term_bookings to authenticated;
