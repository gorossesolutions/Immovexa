-- ============================================================
-- PHOTOS MULTIPLES PAR BIEN — remplace properties.cover_image_url
-- (jamais alimenté par l'app jusqu'ici, sans risque de perte de
-- données) par une table property_photos, plusieurs fichiers par
-- bien, ordonnés par position. Bucket storage property-photos déjà
-- créé et policié en 0005_storage.sql (public read, staff write
-- scopé par dossier organization_id) — aucun changement nécessaire
-- côté storage, seulement la table de suivi ci-dessous.
-- ============================================================

create table property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  file_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_property_photos_property on property_photos(property_id);

alter table property_photos enable row level security;

grant select, insert, update, delete on property_photos to authenticated;

create policy "property_photos_staff_all" on property_photos
  for all using (
    (current_profile()).role in ('admin','agent')
    and property_id in (select id from properties where organization_id = (current_profile()).organization_id)
  );

create policy "property_photos_owner_read" on property_photos
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select owned_property_ids())
  );

create policy "property_photos_tenant_read" on property_photos
  for select using (
    (current_profile()).role = 'tenant'
    and property_id in (select tenant_active_property_ids())
  );

alter table properties drop column cover_image_url;
