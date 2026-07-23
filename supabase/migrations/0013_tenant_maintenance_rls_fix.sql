-- ============================================================
-- FIX : maintenance_tenant_create ne vérifiait que reported_by = auth.uid(),
-- pas que property_id appartient à un bail actif du locataire (ni même que
-- organization_id correspond à son organisation). Trouvé en construisant
-- l'écran de création de ticket du portail tenant (Phase 5).
-- ============================================================

drop policy "maintenance_tenant_create" on maintenance_requests;

create policy "maintenance_tenant_create" on maintenance_requests
  for insert with check (
    (current_profile()).role = 'tenant'
    and reported_by = auth.uid()
    and property_id in (select tenant_active_property_ids())
  );
