-- ============================================================
-- SUBDIVISION DE TERRAIN — un terrain (property_type = 'land') peut être
-- subdivisé en lots, chacun devenant une property enfant. Le parent reste
-- vendable/louable en parallèle (pas de blocage), simple lien de traçabilité.
-- 'land' existe déjà dans le check constraint de property_type (0001).
-- ============================================================

alter table properties add column parent_property_id uuid references properties(id);

create index idx_properties_parent on properties(parent_property_id);
