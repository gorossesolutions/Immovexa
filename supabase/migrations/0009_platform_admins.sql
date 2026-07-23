-- ============================================================
-- PLATFORM ADMINS — accès superadmin transverse, hors modèle
-- multi-tenant (pas lié à organizations/profiles).
-- ============================================================

create table platform_admins (
  user_id uuid primary key references auth.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS activée sans aucune policy : deny-by-default pour authenticated/anon.
-- Aucun grant table n'est accordé non plus (cf. 0003) : personne ne peut lire
-- platform_admins directement, même en lecture seule. Seule is_platform_admin()
-- (security definer, donc exécutée avec les droits du propriétaire) peut la lire.
alter table platform_admins enable row level security;

create or replace function is_platform_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from platform_admins where user_id = auth.uid() and active = true
  )
$$;
