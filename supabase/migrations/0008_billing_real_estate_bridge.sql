-- ============================================================
-- PONT immobilier -> billing (accès owner/tenant en lecture)
--
-- Ce fichier — et lui seul — sait que `billing_accounts.owner_entity_type`
-- peut valoir 'lease'. Le moteur générique (0007_billing_engine.sql) n'en
-- sait toujours rien : ses tables, vues et fonctions restent 100%
-- réutilisables tel quel pour un autre secteur (ex: healthcare). Si le
-- module real-estate était retiré du produit, il suffirait de ne pas
-- appliquer ce fichier — 0007 resterait intact et fonctionnel.
--
-- Fiabilité : on réutilise exactement le pattern déjà éprouvé deux fois
-- dans ce projet (migrations 0002 et 0004) pour éliminer les récursions
-- RLS — des fonctions `security definer stable` qui court-circuitent la
-- RLS des tables qu'elles interrogent au lieu de la redéclencher. Elles
-- s'appuient sur `tenant_lease_ids()` / `owner_lease_ids()`, déjà en
-- place depuis 0004.
-- ============================================================

create or replace function tenant_billing_account_ids()
returns setof uuid
language sql stable security definer
as $$
  select id from billing_accounts
  where owner_entity_type = 'lease'
    and owner_entity_id in (select tenant_lease_ids());
$$;

create or replace function owner_billing_account_ids()
returns setof uuid
language sql stable security definer
as $$
  select id from billing_accounts
  where owner_entity_type = 'lease'
    and owner_entity_id in (select owner_lease_ids());
$$;

-- ---------- BILLING_ACCOUNTS ----------
create policy "billing_accounts_owner_read" on billing_accounts
  for select using (
    (current_profile()).role = 'owner'
    and id in (select owner_billing_account_ids())
  );

create policy "billing_accounts_tenant_read" on billing_accounts
  for select using (
    (current_profile()).role = 'tenant'
    and id in (select tenant_billing_account_ids())
  );

-- ---------- CHARGES ----------
create policy "charges_owner_read" on charges
  for select using (
    (current_profile()).role = 'owner'
    and billing_account_id in (select owner_billing_account_ids())
  );

create policy "charges_tenant_read" on charges
  for select using (
    (current_profile()).role = 'tenant'
    and billing_account_id in (select tenant_billing_account_ids())
  );

-- ---------- PAYMENTS ----------
create policy "payments_owner_read" on payments
  for select using (
    (current_profile()).role = 'owner'
    and billing_account_id in (select owner_billing_account_ids())
  );

create policy "payments_tenant_read" on payments
  for select using (
    (current_profile()).role = 'tenant'
    and billing_account_id in (select tenant_billing_account_ids())
  );

-- ---------- PAYMENT_ALLOCATIONS ----------
-- Référence directe à `charges` (pas via une fonction) : sans risque de
-- récursion puisque aucune policy de `charges` ne référence
-- `payment_allocations` en retour (relation à sens unique).
create policy "payment_allocations_owner_read" on payment_allocations
  for select using (
    (current_profile()).role = 'owner'
    and charge_id in (
      select id from charges where billing_account_id in (select owner_billing_account_ids())
    )
  );

create policy "payment_allocations_tenant_read" on payment_allocations
  for select using (
    (current_profile()).role = 'tenant'
    and charge_id in (
      select id from charges where billing_account_id in (select tenant_billing_account_ids())
    )
  );
