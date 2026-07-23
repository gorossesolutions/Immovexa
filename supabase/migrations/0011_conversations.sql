-- ============================================================
-- CONVERSATIONS / MESSAGES — généralise maintenance_comments à un
-- modèle polymorphe (linked_entity_type/linked_entity_id) réutilisable
-- pour maintenance_request, lease, property.
-- ============================================================

create table conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  linked_entity_type text not null check (linked_entity_type in ('maintenance_request','lease','property')),
  linked_entity_id uuid not null,
  status text not null default 'open' check (status in ('open','resolved','archived')),
  created_at timestamptz not null default now()
);

create index idx_conversations_org on conversations(organization_id);
create index idx_conversations_entity on conversations(linked_entity_type, linked_entity_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_messages_conversation on messages(conversation_id);

-- ---------- Auto-création d'une conversation par maintenance_request ----------
create or replace function create_conversation_for_maintenance()
returns trigger language plpgsql security definer as $$
begin
  insert into conversations (organization_id, linked_entity_type, linked_entity_id, status)
  values (new.organization_id, 'maintenance_request', new.id, 'open');
  return new;
end;
$$;

create trigger trg_maintenance_request_conversation
  after insert on maintenance_requests
  for each row execute function create_conversation_for_maintenance();

-- ---------- Migration des données existantes ----------
-- No-op sur cet environnement (maintenance_comments est vide), mais correct
-- si cette migration tourne un jour sur un environnement avec des données.
insert into conversations (organization_id, linked_entity_type, linked_entity_id, status)
select mr.organization_id, 'maintenance_request', mr.id, 'open'
from maintenance_requests mr
where not exists (
  select 1 from conversations c
  where c.linked_entity_type = 'maintenance_request' and c.linked_entity_id = mr.id
);

insert into messages (conversation_id, author_id, body, created_at)
select c.id, mc.author_id, mc.message, mc.created_at
from maintenance_comments mc
join conversations c
  on c.linked_entity_type = 'maintenance_request' and c.linked_entity_id = mc.maintenance_request_id;

drop table maintenance_comments;

-- ============================================================
-- RLS
-- ============================================================

alter table conversations enable row level security;
alter table messages enable row level security;

-- Helpers security definer (même pattern que 0002/0004/0008) : couvrent les
-- 3 linked_entity_type possibles en une seule fonction, pour éviter la
-- récursion RLS et éviter de dupliquer le CASE dans chaque policy.
create or replace function owner_conversation_ids()
returns setof uuid language sql stable security definer as $$
  select id from conversations
  where (linked_entity_type = 'maintenance_request' and linked_entity_id in (
           select id from maintenance_requests where property_id in (select owned_property_ids())
         ))
     or (linked_entity_type = 'lease' and linked_entity_id in (select owner_lease_ids()))
     or (linked_entity_type = 'property' and linked_entity_id in (select owned_property_ids()));
$$;

create or replace function tenant_conversation_ids()
returns setof uuid language sql stable security definer as $$
  select id from conversations
  where (linked_entity_type = 'maintenance_request' and linked_entity_id in (
           select id from maintenance_requests where reported_by = auth.uid()
         ))
     or (linked_entity_type = 'lease' and linked_entity_id in (select tenant_lease_ids()))
     or (linked_entity_type = 'property' and linked_entity_id in (select tenant_active_property_ids()));
$$;

-- ---------- CONVERSATIONS ----------
create policy "conversations_staff_all" on conversations
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "conversations_owner_read" on conversations
  for select using (
    (current_profile()).role = 'owner'
    and id in (select owner_conversation_ids())
  );

create policy "conversations_tenant_read" on conversations
  for select using (
    (current_profile()).role = 'tenant'
    and id in (select tenant_conversation_ids())
  );

-- ---------- MESSAGES ----------
create policy "messages_staff_all" on messages
  for all using (
    (current_profile()).role in ('admin','agent')
    and conversation_id in (
      select id from conversations where organization_id = (current_profile()).organization_id
    )
  );

create policy "messages_owner_read" on messages
  for select using (
    (current_profile()).role = 'owner'
    and conversation_id in (select owner_conversation_ids())
  );

create policy "messages_tenant_read" on messages
  for select using (
    (current_profile()).role = 'tenant'
    and conversation_id in (select tenant_conversation_ids())
  );

create policy "messages_tenant_create" on messages
  for insert with check (
    (current_profile()).role = 'tenant'
    and author_id = auth.uid()
    and conversation_id in (select tenant_conversation_ids())
  );

-- GRANT de base requis en plus de la RLS (cf. 0003)
grant select, insert, update, delete on conversations, messages to authenticated;
