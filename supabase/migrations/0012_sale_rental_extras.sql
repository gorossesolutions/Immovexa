-- ============================================================
-- Complète 0006 : précisions bien (floor_level/unit_number/unit_scope),
-- vue de statut commercial, règle de blocage sur les listings actifs.
-- ============================================================

alter table properties add column floor_level text;
alter table properties add column unit_number text;
alter table properties add column unit_scope text
  check (unit_scope in ('entire_property','floor_only','room_only'))
  default 'entire_property';

-- security_invoker = true est indispensable (cf. 0007) : sans lui, la vue
-- s'exécute avec les droits du propriétaire (postgres) et bypasse la RLS
-- des tables sous-jacentes, montrant tous les biens à tout le monde.
--
-- LATERAL + LIMIT 1 plutôt qu'un simple LEFT JOIN : rien n'empêche
-- plusieurs listings actifs du même type sur un bien (ex: après une
-- réactivation, l'ancien listing reste 'active' si personne ne le clôture
-- explicitement). Un LEFT JOIN nu ferait alors un produit cartésien et
-- renverrait plusieurs lignes pour le même property_id, cassant l'usage
-- 1 bien = 1 statut commercial. LATERAL garantit une seule ligne par bien
-- en prenant le listing/sale le plus récent.
create view property_commercial_status with (security_invoker = true) as
select
  p.id as property_id,
  case
    when s.status = 'completed' then 'sold'
    when s.status in ('offer','compromis','deed_pending') then 'under_offer'
    when l_sale.id is not null then 'for_sale'
    when l_lt.id is not null then 'rented_long_term'
    when l_st.id is not null then 'short_term_active'
    else 'no_active_listing'
  end as commercial_status
from properties p
left join lateral (
  select * from listings
  where property_id = p.id and listing_type = 'sale' and status = 'active'
  order by created_at desc limit 1
) l_sale on true
left join lateral (
  select * from sales
  where listing_id = l_sale.id
  order by created_at desc limit 1
) s on true
left join lateral (
  select * from listings
  where property_id = p.id and listing_type = 'long_term_rental' and status = 'active'
  order by created_at desc limit 1
) l_lt on true
left join lateral (
  select * from listings
  where property_id = p.id and listing_type = 'short_term_rental' and status = 'active'
  order by created_at desc limit 1
) l_st on true;

grant select on property_commercial_status to authenticated;

-- ============================================================
-- RÈGLE DE BLOCAGE : pas de nouveau listing actif sur un bien dont le
-- dernier sale lié est 'completed', sauf réactivation explicite.
--
-- Implémentation : trigger bloquant par défaut sur INSERT/UPDATE, avec un
-- flag de session (local à la transaction) que seule la fonction dédiée
-- reactivate_property_listing() peut poser. Un insert direct depuis le
-- client ne peut donc jamais contourner le blocage.
-- ============================================================

create or replace function check_listing_reactivation()
returns trigger language plpgsql as $$
declare
  v_last_sale_status text;
begin
  if new.status = 'active' and coalesce(current_setting('app.allow_relist', true), 'false') <> 'true' then
    select s.status into v_last_sale_status
    from sales s
    join listings l on l.id = s.listing_id
    where l.property_id = new.property_id
    order by s.created_at desc
    limit 1;

    if v_last_sale_status = 'completed' then
      raise exception 'RELIST_BLOCKED: ce bien a une vente déjà finalisée, réactivation explicite requise';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_listing_reactivation_check
  before insert or update of status, property_id on listings
  for each row execute function check_listing_reactivation();

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

  return v_listing_id;
end;
$$;

grant execute on function reactivate_property_listing(uuid, uuid, text, numeric, numeric, numeric, text, numeric) to authenticated;
