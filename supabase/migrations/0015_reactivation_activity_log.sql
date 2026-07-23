-- ============================================================
-- Phase 2 : journalisation de la réactivation d'un bien vendu.
--
-- activity_log a RLS activée sans aucune policy depuis 0001 : même le
-- staff ne peut pas y insérer directement. L'insertion se fait donc à
-- l'intérieur de reactivate_property_listing() (déjà security definer,
-- bypass la RLS), plutôt que via un second appel client qui échouerait.
-- ============================================================

create or replace function reactivate_property_listing(
  p_organization_id uuid,
  p_property_id uuid,
  p_listing_type text,
  p_price numeric default null,
  p_monthly_rent numeric default null,
  p_nightly_rate numeric default null,
  p_currency text default 'MUR',
  p_commission_rate numeric default null
)
returns uuid language plpgsql security definer as $$
declare
  v_listing_id uuid;
begin
  if (current_profile()).role not in ('admin','agent') then
    raise exception 'Seul le staff peut réactiver une annonce.';
  end if;
  if (current_profile()).organization_id <> p_organization_id then
    raise exception 'Organisation invalide.';
  end if;

  perform set_config('app.allow_relist', 'true', true);

  insert into listings (organization_id, property_id, listing_type, status, price, monthly_rent, nightly_rate, currency, commission_rate)
  values (p_organization_id, p_property_id, p_listing_type, 'active', p_price, p_monthly_rent, p_nightly_rate, p_currency, p_commission_rate)
  returning id into v_listing_id;

  insert into activity_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_organization_id,
    auth.uid(),
    'property.reactivated_for_sale',
    'property',
    p_property_id,
    jsonb_build_object('listing_id', v_listing_id, 'listing_type', p_listing_type, 'price', p_price)
  );

  return v_listing_id;
end;
$$;
