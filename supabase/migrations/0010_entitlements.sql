-- ============================================================
-- ENTITLEMENTS GÉNÉRIQUES — remplace organizations.plan par un
-- système clé/valeur par plan, consommable via has_entitlement().
-- Générique par conception : entitlement_key est du texte libre,
-- ce module ne connaît aucun concept métier (immobilier ou autre).
-- ============================================================

create table plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null check (plan_code in ('t1_core','t2_connect')),
  entitlement_key text not null,
  value boolean not null default false,
  created_at timestamptz not null default now(),
  unique (plan_code, entitlement_key)
);

insert into plan_entitlements (plan_code, entitlement_key, value) values
  ('t1_core', 'portal.owner', false),
  ('t1_core', 'portal.tenant', false),
  ('t1_core', 'messaging.external', false),
  ('t1_core', 'maintenance.tenant_create', false),
  ('t1_core', 'billing.ledger', true),
  ('t1_core', 'documents.internal', true),
  ('t2_connect', 'portal.owner', true),
  ('t2_connect', 'portal.tenant', true),
  ('t2_connect', 'messaging.external', true),
  ('t2_connect', 'maintenance.tenant_create', true),
  ('t2_connect', 'billing.ledger', true),
  ('t2_connect', 'documents.internal', true),
  ('t2_connect', 'documents.external_share', true);

-- ---------- organizations.plan -> organizations.plan_code ----------
-- Migration de données : ajout nullable, backfill, puis contrainte NOT NULL
-- et suppression de l'ancienne colonne. Sans effet sur un reset local (la
-- table organizations est vide à ce stade, peuplée ensuite par seed.sql),
-- mais correct pour tout environnement où organizations a déjà des lignes.
alter table organizations add column plan_code text
  check (plan_code in ('t1_core','t2_connect'));

update organizations set plan_code = 't2_connect' where plan_code is null;

alter table organizations alter column plan_code set not null;
alter table organizations drop column plan;

create or replace function has_entitlement(p_organization_id uuid, p_key text)
returns boolean language sql stable security definer as $$
  select coalesce(
    (
      select pe.value
      from organizations o
      join plan_entitlements pe
        on pe.plan_code = o.plan_code and pe.entitlement_key = p_key
      where o.id = p_organization_id
    ),
    false
  )
$$;
