-- ============================================================
-- STORAGE — buckets (section 5 de la spec) + policies RLS
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('branding', 'branding', true),
  ('property-photos', 'property-photos', true),
  ('documents', 'documents', false)
on conflict (id) do nothing;

-- ---------- BRANDING (public en lecture, admin en écriture) ----------
create policy "storage_branding_public_read" on storage.objects
  for select using (bucket_id = 'branding');

create policy "storage_branding_admin_write" on storage.objects
  for all using (
    bucket_id = 'branding'
    and (current_profile()).role = 'admin'
    and (storage.foldername(name))[1] = (current_profile()).organization_id::text
  );

-- ---------- PROPERTY-PHOTOS (public en lecture, staff en écriture) ----------
create policy "storage_property_photos_public_read" on storage.objects
  for select using (bucket_id = 'property-photos');

create policy "storage_property_photos_staff_write" on storage.objects
  for all using (
    bucket_id = 'property-photos'
    and (current_profile()).role in ('admin','agent')
    and (storage.foldername(name))[1] = (current_profile()).organization_id::text
  );

-- ---------- DOCUMENTS (privé — accès via signed URL après vérification RLS) ----------
create policy "storage_documents_staff_all" on storage.objects
  for all using (
    bucket_id = 'documents'
    and (current_profile()).role in ('admin','agent')
    and (storage.foldername(name))[1] = (current_profile()).organization_id::text
  );

-- Owner/tenant : lecture seule, autorisée uniquement si une ligne `documents`
-- correspondante est visible pour eux (la RLS de la table documents fait
-- déjà le filtrage fin par visibility/organization_id).
create policy "storage_documents_owner_tenant_read" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (current_profile()).role in ('owner','tenant')
    and exists (select 1 from documents d where d.file_path = storage.objects.name)
  );
