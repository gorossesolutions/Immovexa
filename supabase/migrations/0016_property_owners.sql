-- ============================================================
-- MULTI-PROPRIÉTAIRE — remplace la colonne unique properties.owner_id
-- par une table de jointure property_owners (plusieurs propriétaires
-- par bien, avec répartition en %).
--
-- properties.owner_id est CONSERVÉE dans cette migration (pas de drop)
-- pour permettre de vérifier tout le code applicatif avant suppression
-- définitive dans une migration séparée ultérieure. Elle devient nullable
-- car le code applicatif ne l'alimente plus (source de vérité = property_owners).
-- ============================================================

alter table properties alter column owner_id drop not null;

create table property_owners (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  owner_id uuid not null references profiles(id),
  ownership_percentage numeric,
  created_at timestamptz not null default now(),
  unique (property_id, owner_id)
);

alter table property_owners enable row level security;

-- RLS filtre les lignes, mais Postgres exige en plus un GRANT de base sur
-- la table pour le rôle authenticated (même prérequis que 0003/0006).
grant select, insert, update, delete on property_owners to authenticated;

create policy "property_owners_staff_all" on property_owners
  for all using (
    (current_profile()).role in ('admin','agent')
    and property_id in (
      select id from properties where organization_id = (current_profile()).organization_id
    )
  );

create policy "property_owners_owner_read" on property_owners
  for select using (
    (current_profile()).role = 'owner'
    and owner_id = auth.uid()
  );

-- Backfill : un propriétaire à 100% pour chaque bien existant qui a un owner_id.
insert into property_owners (property_id, owner_id, ownership_percentage)
select id, owner_id, 100
from properties
where owner_id is not null;

-- ---------- Fonctions security definer réécrites sur property_owners ----------

create or replace function owned_property_ids()
returns setof uuid
language sql stable security definer
as $$
  select property_id from property_owners where owner_id = auth.uid();
$$;

create or replace function owner_lease_ids()
returns setof uuid
language sql stable security definer
as $$
  select l.id from leases l
  where l.property_id in (select property_id from property_owners where owner_id = auth.uid());
$$;

-- ---------- Policies qui testaient owner_id = auth.uid() en brut ----------

drop policy "properties_owner_read" on properties;
create policy "properties_owner_read" on properties
  for select using (
    (current_profile()).role = 'owner'
    and id in (select owned_property_ids())
  );

drop policy "maintenance_owner_read" on maintenance_requests;
create policy "maintenance_owner_read" on maintenance_requests
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select owned_property_ids())
  );

-- maintenance_comments a été supprimée en 0011 (généralisée en conversations/
-- messages) ; owner_conversation_ids() s'appuie déjà sur owned_property_ids(),
-- donc elle se corrige automatiquement sans policy à réécrire ici.

-- ---------- Trigger de notification : boucle sur tous les propriétaires ----------

create or replace function notify_on_new_charge()
returns trigger language plpgsql security definer as $$
declare
  v_lease_id uuid;
  v_property_id uuid;
  v_owner record;
  v_tenant record;
  v_body text;
begin
  select owner_entity_id into v_lease_id
  from billing_accounts
  where id = new.billing_account_id and owner_entity_type = 'lease';

  if v_lease_id is null then
    return new;
  end if;

  v_body := new.amount::text || ' - échéance le ' || new.due_date::text;

  for v_tenant in select tenant_id from lease_tenants where lease_id = v_lease_id loop
    insert into notifications (profile_id, title, body, link)
    values (v_tenant.tenant_id, 'Nouvelle échéance', v_body, '/tenant/payments');
  end loop;

  select property_id into v_property_id from leases where id = v_lease_id;

  for v_owner in select owner_id from property_owners where property_id = v_property_id loop
    insert into notifications (profile_id, title, body, link)
    values (v_owner.owner_id, 'Nouvelle échéance', v_body, '/owner/payments');
  end loop;

  return new;
end;
$$;
