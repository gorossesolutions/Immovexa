-- ============================================================
-- FIX: infinite recursion in RLS between leases <-> lease_tenants
-- (and transitively payments, which reads lease_tenants)
--
-- Same root cause as 0002: leases_tenant_read reads from
-- lease_tenants, while lease_tenants_staff_all / lease_tenants_owner_read
-- read from leases. Same fix: move every cross-table lookup behind
-- a security definer helper function so the inner lookup bypasses
-- RLS on the referenced table instead of re-triggering it.
-- ============================================================

create or replace function tenant_lease_ids()
returns setof uuid
language sql stable security definer
as $$
  select lease_id from lease_tenants where tenant_id = auth.uid();
$$;

create or replace function org_lease_ids()
returns setof uuid
language sql stable security definer
as $$
  select id from leases where organization_id = (current_profile()).organization_id;
$$;

create or replace function owner_lease_ids()
returns setof uuid
language sql stable security definer
as $$
  select l.id from leases l
  join properties p on p.id = l.property_id
  where p.owner_id = auth.uid();
$$;

drop policy "leases_tenant_read" on leases;
create policy "leases_tenant_read" on leases
  for select using (
    (current_profile()).role = 'tenant'
    and id in (select tenant_lease_ids())
  );

drop policy "lease_tenants_staff_all" on lease_tenants;
create policy "lease_tenants_staff_all" on lease_tenants
  for all using (
    (current_profile()).role in ('admin','agent')
    and lease_id in (select org_lease_ids())
  );

drop policy "lease_tenants_owner_read" on lease_tenants;
create policy "lease_tenants_owner_read" on lease_tenants
  for select using (
    (current_profile()).role = 'owner'
    and lease_id in (select owner_lease_ids())
  );

drop policy "payments_owner_read" on payments;
create policy "payments_owner_read" on payments
  for select using (
    (current_profile()).role = 'owner'
    and lease_id in (select owner_lease_ids())
  );

drop policy "payments_tenant_read" on payments;
create policy "payments_tenant_read" on payments
  for select using (
    (current_profile()).role = 'tenant'
    and lease_id in (select tenant_lease_ids())
  );
