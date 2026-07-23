-- ============================================================
-- FIX: infinite recursion in RLS between properties <-> leases
--
-- properties_tenant_read (on properties) reads from leases, and
-- leases_owner_read (on leases) reads from properties. Postgres
-- re-evaluates each table's RLS when the other is queried inside
-- a policy, producing an infinite loop.
--
-- Fix: wrap the two cross-table lookups in `security definer`
-- helper functions (same pattern as current_profile()), so the
-- inner lookup bypasses RLS on the referenced table instead of
-- re-triggering it. Same rows returned, same permission logic.
-- ============================================================

create or replace function owned_property_ids()
returns setof uuid
language sql stable security definer
as $$
  select id from properties where owner_id = auth.uid();
$$;

create or replace function tenant_active_property_ids()
returns setof uuid
language sql stable security definer
as $$
  select l.property_id from leases l
  join lease_tenants lt on lt.lease_id = l.id
  where lt.tenant_id = auth.uid() and l.status = 'active';
$$;

drop policy "properties_tenant_read" on properties;
create policy "properties_tenant_read" on properties
  for select using (
    (current_profile()).role = 'tenant'
    and id in (select tenant_active_property_ids())
  );

drop policy "leases_owner_read" on leases;
create policy "leases_owner_read" on leases
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select owned_property_ids())
  );
