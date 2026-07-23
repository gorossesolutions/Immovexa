-- ============================================================
-- NOTIFICATIONS — 3 triggers alimentant la table `notifications`
-- (existante depuis 0001, jusqu'ici jamais consommée par aucun écran).
-- ============================================================

-- ---------- Nouveau message sur une conversation ----------
create or replace function notify_on_new_message()
returns trigger language plpgsql security definer as $$
declare
  v_conversation conversations;
  v_maintenance maintenance_requests;
  v_staff record;
begin
  select * into v_conversation from conversations where id = new.conversation_id;

  if v_conversation.linked_entity_type = 'maintenance_request' then
    select * into v_maintenance from maintenance_requests where id = v_conversation.linked_entity_id;
    if v_maintenance.id is null then
      return new;
    end if;

    if new.author_id = v_maintenance.reported_by then
      -- auteur = locataire -> notifier le staff de l'organisation
      for v_staff in
        select id from profiles
        where organization_id = v_maintenance.organization_id and role in ('admin', 'agent')
      loop
        insert into notifications (profile_id, title, body, link)
        values (v_staff.id, 'Nouveau message', v_maintenance.title, '/admin/maintenance/' || v_maintenance.id);
      end loop;
    else
      -- auteur = staff -> notifier le locataire qui a signalé le ticket
      insert into notifications (profile_id, title, body, link)
      values (v_maintenance.reported_by, 'Nouveau message', v_maintenance.title, '/tenant/maintenance/' || v_maintenance.id);
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_notify_on_new_message
  after insert on messages
  for each row execute function notify_on_new_message();

-- ---------- Statut de maintenance changé ----------
create or replace function notify_on_maintenance_status_change()
returns trigger language plpgsql security definer as $$
begin
  if new.status is distinct from old.status then
    insert into notifications (profile_id, title, body, link)
    values (new.reported_by, 'Statut mis à jour', new.title, '/tenant/maintenance/' || new.id);
  end if;
  return new;
end;
$$;

create trigger trg_notify_on_maintenance_status_change
  after update of status on maintenance_requests
  for each row execute function notify_on_maintenance_status_change();

-- ============================================================
-- PONT IMMOBILIER — ce trigger s'attache à `charges` (table générique du
-- module billing, 0007) mais doit résoudre billing_account -> lease pour
-- savoir qui notifier. Isolé ici volontairement, même discipline que 0008 :
-- le module billing lui-même reste 100% générique, aucune référence à
-- 'lease'/'tenant' n'existe dans 0007. Si le module real-estate était
-- retiré du produit, il suffirait de ne pas appliquer ce trigger.
-- ============================================================
create or replace function notify_on_new_charge()
returns trigger language plpgsql security definer as $$
declare
  v_lease_id uuid;
  v_owner_id uuid;
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

  select p.owner_id into v_owner_id
  from leases l join properties p on p.id = l.property_id
  where l.id = v_lease_id;

  if v_owner_id is not null then
    insert into notifications (profile_id, title, body, link)
    values (v_owner_id, 'Nouvelle échéance', v_body, '/owner/payments');
  end if;

  return new;
end;
$$;

create trigger trg_notify_on_new_charge
  after insert on charges
  for each row execute function notify_on_new_charge();

-- ============================================================
-- FIX : `documents` n'avait aucune policy INSERT pour le rôle tenant
-- (seulement documents_tenant_read, en lecture). Nécessaire pour la
-- nouvelle photo jointe au formulaire de création de ticket maintenance
-- (Phase 7). Scopé à ses propres tickets uniquement.
-- ============================================================
create policy "documents_tenant_create" on documents
  for insert with check (
    (current_profile()).role = 'tenant'
    and entity_type = 'maintenance'
    and entity_id in (select id from maintenance_requests where reported_by = auth.uid())
    and uploaded_by = auth.uid()
  );

-- Storage a sa PROPRE couche RLS sur storage.objects, distincte de celle sur
-- la table `documents` (cf. 0005) : le fix ci-dessus ne suffit pas, il fallait
-- aussi autoriser l'upload physique du fichier pour ce même cas précis.
create policy "storage_documents_tenant_write_maintenance" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (current_profile()).role = 'tenant'
    and (storage.foldername(name))[1] = (current_profile()).organization_id::text
    and (storage.foldername(name))[2] = 'maintenance'
    and (storage.foldername(name))[3] in (select id::text from maintenance_requests where reported_by = auth.uid())
  );
