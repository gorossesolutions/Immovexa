-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- ORGANIZATIONS (marque blanche / multi-tenant)
-- ============================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  currency text not null default 'MUR' check (currency in ('MUR','EUR','USD')),
  locale text not null default 'fr',
  plan text not null default 'starter' check (plan in ('starter','boost','kickstart')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- BRANDING SETTINGS (1-1 avec organizations, éditable en admin)
-- ============================================================
create table branding_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  display_name text not null,
  logo_url text,
  favicon_url text,
  primary_color text not null default '#0f172a',
  secondary_color text not null default '#0067ff',
  accent_color text not null default '#e7f6ff',
  neutral_color text not null default '#364151',
  font_family text not null default 'Inter',
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROFILES (étend auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('admin','agent','owner','tenant')),
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index idx_profiles_org on profiles(organization_id);
create index idx_profiles_role on profiles(role);

-- ============================================================
-- PROPERTIES (biens)
-- ============================================================
create table properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references profiles(id),
  reference text not null,
  address_line text not null,
  city text not null,
  region text,                     -- district mauricien (Rivière du Rempart, Plaines Wilhems...)
  postal_code text,
  property_type text not null check (property_type in ('apartment','house','office','commercial','land','other')),
  surface_area numeric,
  rooms integer,
  bedrooms integer,
  bathrooms integer,
  furnished boolean not null default false,
  status text not null default 'vacant' check (status in ('vacant','occupied','maintenance','archived')),
  monthly_rent numeric not null,
  deposit_amount numeric,
  currency text not null default 'MUR' check (currency in ('MUR','EUR','USD')),
  description text,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create index idx_properties_org on properties(organization_id);
create index idx_properties_owner on properties(owner_id);

-- ============================================================
-- LEASES (baux)
-- ============================================================
create table leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','active','ended','terminated')),
  start_date date not null,
  end_date date,
  rent_amount numeric not null,
  charges_amount numeric not null default 0,
  deposit_amount numeric,
  payment_day integer not null default 1 check (payment_day between 1 and 28),
  lease_type text not null default 'residential' check (lease_type in ('residential','commercial','seasonal')),
  renewal_type text not null default 'fixed' check (renewal_type in ('fixed','tacit_renewal')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_leases_org on leases(organization_id);
create index idx_leases_property on leases(property_id);
create index idx_leases_status on leases(status);

-- ============================================================
-- LEASE_TENANTS (colocataires — many-to-many)
-- ============================================================
create table lease_tenants (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references leases(id) on delete cascade,
  tenant_id uuid not null references profiles(id),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (lease_id, tenant_id)
);

create index idx_lease_tenants_lease on lease_tenants(lease_id);
create index idx_lease_tenants_tenant on lease_tenants(tenant_id);

-- ============================================================
-- PAYMENTS (loyers / échéances)
-- ============================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lease_id uuid not null references leases(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  amount_due numeric not null,
  amount_paid numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','partial','paid','late','waived')),
  paid_date date,
  payment_method text check (payment_method in ('bank_transfer','cash','cheque','other')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_payments_org on payments(organization_id);
create index idx_payments_lease on payments(lease_id);
create index idx_payments_status on payments(status);
create index idx_payments_due_date on payments(due_date);

-- ============================================================
-- DOCUMENTS (polymorphe — héberge tous les fichiers)
-- ============================================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('property','lease','payment','tenant','owner','maintenance','organization')),
  entity_id uuid not null,
  category text not null check (category in (
    'lease_contract','id_document','inventory_checkin','inventory_checkout',
    'receipt','invoice','diagnostic','insurance','other'
  )),
  file_name text not null,
  file_path text not null,       -- chemin dans Supabase Storage
  file_size integer,
  mime_type text,
  uploaded_by uuid not null references profiles(id),
  visibility text not null default 'shared' check (visibility in ('admin_only','owner_shared','tenant_shared','shared')),
  created_at timestamptz not null default now()
);

create index idx_documents_org on documents(organization_id);
create index idx_documents_entity on documents(entity_type, entity_id);

-- ============================================================
-- MAINTENANCE REQUESTS (demandes d'intervention — remplace le chat)
-- ============================================================
create table maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  lease_id uuid references leases(id),
  reported_by uuid not null references profiles(id),
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_maintenance_org on maintenance_requests(organization_id);
create index idx_maintenance_property on maintenance_requests(property_id);

create table maintenance_comments (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references maintenance_requests(id) on delete cascade,
  author_id uuid not null references profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);

create index idx_maintenance_comments_request on maintenance_comments(maintenance_request_id);

-- ============================================================
-- ACTIVITY LOG (audit trail)
-- ============================================================
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null,              -- ex: 'lease.created', 'payment.marked_paid'
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_org on activity_log(organization_id);
create index idx_activity_entity on activity_log(entity_type, entity_id);

-- ============================================================
-- NOTIFICATIONS (in-app uniquement, pas d'email/WhatsApp en V1)
-- ============================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_profile on notifications(profile_id, read_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Active RLS partout
alter table organizations enable row level security;
alter table branding_settings enable row level security;
alter table profiles enable row level security;
alter table properties enable row level security;
alter table leases enable row level security;
alter table lease_tenants enable row level security;
alter table payments enable row level security;
alter table documents enable row level security;
alter table maintenance_requests enable row level security;
alter table maintenance_comments enable row level security;
alter table activity_log enable row level security;
alter table notifications enable row level security;

-- Fonction utilitaire : récupère le profil courant
create or replace function current_profile()
returns profiles
language sql stable security definer
as $$
  select * from profiles where id = auth.uid();
$$;

-- ---------- PROFILES ----------
create policy "profiles_select_own_org" on profiles
  for select using (organization_id = (current_profile()).organization_id);

create policy "profiles_admin_manage" on profiles
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

-- ---------- PROPERTIES ----------
-- Admin/agent : accès total sur leur org
create policy "properties_staff_all" on properties
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

-- Owner : lecture seule sur SES biens
create policy "properties_owner_read" on properties
  for select using (
    (current_profile()).role = 'owner'
    and owner_id = auth.uid()
  );

-- Tenant : lecture seule sur le bien lié à son bail actif
create policy "properties_tenant_read" on properties
  for select using (
    (current_profile()).role = 'tenant'
    and id in (
      select l.property_id from leases l
      join lease_tenants lt on lt.lease_id = l.id
      where lt.tenant_id = auth.uid() and l.status = 'active'
    )
  );

-- ---------- LEASES ----------
create policy "leases_staff_all" on leases
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "leases_owner_read" on leases
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select id from properties where owner_id = auth.uid())
  );

create policy "leases_tenant_read" on leases
  for select using (
    (current_profile()).role = 'tenant'
    and id in (select lease_id from lease_tenants where tenant_id = auth.uid())
  );

-- ---------- LEASE_TENANTS ----------
-- Même pattern que leases (staff_all / owner_read / tenant_read), scopé via la table leases
-- car lease_tenants ne porte pas organization_id directement.
create policy "lease_tenants_staff_all" on lease_tenants
  for all using (
    (current_profile()).role in ('admin','agent')
    and lease_id in (
      select id from leases where organization_id = (current_profile()).organization_id
    )
  );

create policy "lease_tenants_owner_read" on lease_tenants
  for select using (
    (current_profile()).role = 'owner'
    and lease_id in (
      select l.id from leases l
      join properties p on p.id = l.property_id
      where p.owner_id = auth.uid()
    )
  );

create policy "lease_tenants_tenant_read" on lease_tenants
  for select using (
    (current_profile()).role = 'tenant'
    and tenant_id = auth.uid()
  );

-- ---------- PAYMENTS ----------
create policy "payments_staff_all" on payments
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "payments_owner_read" on payments
  for select using (
    (current_profile()).role = 'owner'
    and lease_id in (
      select l.id from leases l
      join properties p on p.id = l.property_id
      where p.owner_id = auth.uid()
    )
  );

create policy "payments_tenant_read" on payments
  for select using (
    (current_profile()).role = 'tenant'
    and lease_id in (select lease_id from lease_tenants where tenant_id = auth.uid())
  );

-- ---------- DOCUMENTS ----------
create policy "documents_staff_all" on documents
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "documents_owner_read" on documents
  for select using (
    (current_profile()).role = 'owner'
    and visibility in ('owner_shared','shared')
    and organization_id = (current_profile()).organization_id
    -- filtrage fin par entity_id fait côté requête applicative (property/lease appartenant au owner)
  );

create policy "documents_tenant_read" on documents
  for select using (
    (current_profile()).role = 'tenant'
    and visibility in ('tenant_shared','shared')
    and organization_id = (current_profile()).organization_id
  );

-- ---------- MAINTENANCE ----------
create policy "maintenance_staff_all" on maintenance_requests
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "maintenance_tenant_own" on maintenance_requests
  for select using (
    (current_profile()).role = 'tenant'
    and reported_by = auth.uid()
  );

create policy "maintenance_tenant_create" on maintenance_requests
  for insert with check (
    (current_profile()).role = 'tenant'
    and reported_by = auth.uid()
  );

create policy "maintenance_owner_read" on maintenance_requests
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select id from properties where owner_id = auth.uid())
  );

-- ---------- MAINTENANCE_COMMENTS ----------
-- Même pattern que maintenance_requests, scopé via maintenance_request_id.
create policy "maintenance_comments_staff_all" on maintenance_comments
  for all using (
    (current_profile()).role in ('admin','agent')
    and maintenance_request_id in (
      select id from maintenance_requests
      where organization_id = (current_profile()).organization_id
    )
  );

create policy "maintenance_comments_tenant_read" on maintenance_comments
  for select using (
    (current_profile()).role = 'tenant'
    and maintenance_request_id in (
      select id from maintenance_requests where reported_by = auth.uid()
    )
  );

create policy "maintenance_comments_tenant_create" on maintenance_comments
  for insert with check (
    (current_profile()).role = 'tenant'
    and author_id = auth.uid()
    and maintenance_request_id in (
      select id from maintenance_requests where reported_by = auth.uid()
    )
  );

create policy "maintenance_comments_owner_read" on maintenance_comments
  for select using (
    (current_profile()).role = 'owner'
    and maintenance_request_id in (
      select mr.id from maintenance_requests mr
      join properties p on p.id = mr.property_id
      where p.owner_id = auth.uid()
    )
  );

-- ---------- NOTIFICATIONS ----------
create policy "notifications_own" on notifications
  for all using (profile_id = auth.uid());

-- ---------- BRANDING (lecture publique, écriture admin seul) ----------
create policy "branding_public_read" on branding_settings
  for select using (true);

create policy "branding_admin_write" on branding_settings
  for update using (
    (current_profile()).role = 'admin'
    and organization_id = (current_profile()).organization_id
  );
