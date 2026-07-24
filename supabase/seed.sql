-- ============================================================
-- SEED — organisation de démonstration "GR Immo Test"
-- Comptes : 5 staff (admin/agent), 5 owners, 5 tenants, 1 superadmin
-- plateforme (mot de passe pour tous : Password123!).
-- Le superadmin n'a volontairement pas de ligne dans profiles :
-- platform_admins est hors modèle multi-tenant (pas d'organisation,
-- pas de rôle métier), voir 0009_platform_admins.sql.
--
-- Cas de figure couverts par compte (au-delà des 4 comptes originaux) :
--   admin2        : 2e admin (org multi-admin)
--   agent1/2/3    : rôle agent (pas d'accès /admin/settings)
--   owner-multi   : bien avec annonce de vente active (commercial_status=for_sale)
--   owner-sold    : bien vendu, vente 'completed' (commercial_status=sold — Phase 2)
--   owner-vacant  : uniquement des biens vacants, aucune annonce (0% occupation)
--   owner-empty   : aucun bien (cas "Aucun bien" de admin/owners.ts)
--   tenant-credit : bail actif avec trop-perçu non affecté (Phase 3)
--   tenant-nolease: aucun bail (cas "Aucun bien" de admin/tenants.ts)
--   tenant-past   : bail 'ended', aucun bail actif
--   owner-land    : terrain (TN-909) subdivisé en 2 lots (Phase 2b)
--   GB-101        : bien co-détenu owner/owner-multi à 60/40 (Phase 2a, multi-propriétaire)
--   Carnet d'adresses : 5 contacts (assurance expirée / bientôt expirée / à jour / sans expiration)
-- ============================================================

-- ============================================================
-- GARDE-FOU — refuse de s'exécuter sur une base qui contient déjà des
-- données réelles (protection contre un reseed accidentel en prod).
--
-- Un script SQL exécuté via `supabase db reset` / psql n'a pas accès
-- direct à une variable d'environnement OS comme ENVIRONMENT=production
-- (ça n'existe pas côté Postgres). Le contrôle le plus fiable est donc
-- factuel plutôt que déclaratif : si `organizations` contient déjà des
-- lignes, ce n'est PAS une base de dev vierge — on refuse d'insérer les
-- comptes/données de démonstration par-dessus.
--
-- En complément, si un jour un paramètre Postgres app.settings.environment
-- est configuré sur le projet (ex. custom Postgres config côté Supabase
-- Cloud), il est aussi vérifié ici — mais c'est la vérification factuelle
-- ci-dessus qui protège réellement, elle ne dépend d'aucune configuration
-- externe et fonctionne identiquement en local et sur Supabase Cloud.
-- ============================================================
do $$
begin
  if current_setting('app.settings.environment', true) = 'production' then
    raise exception 'seed.sql refusé : app.settings.environment = production.';
  end if;

  if exists (select 1 from organizations limit 1) then
    raise exception 'seed.sql refusé : la table organizations contient déjà des données. Ce script est réservé à une base de développement vierge — jamais à une base contenant de vraies données (ex. production). Si tu es sûr de vouloir reseed un environnement de test déjà peuplé, vide d''abord les tables concernées explicitement.';
  end if;
end $$;

-- ---------- ORGANIZATION ----------
insert into organizations (id, name, slug, currency, locale, plan_code)
values (
  'a0000000-0000-4000-8000-000000000001',
  'GR Immo Test',
  'gr-immo-test',
  'MUR',
  'fr',
  't2_connect'
);

insert into branding_settings (organization_id, display_name, primary_color, secondary_color, accent_color, neutral_color, font_family)
values (
  'a0000000-0000-4000-8000-000000000001',
  'GR Immo Test',
  '#0f172a',
  '#0067ff',
  '#e7f6ff',
  '#364151',
  'Inter'
);

-- ---------- AUTH USERS ----------
-- Mot de passe pour tous les comptes de démo : Password123!
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000a1',
    'authenticated', 'authenticated',
    'admin@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Admin GR Immo"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000b1',
    'authenticated', 'authenticated',
    'owner@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Devanand Ramsamy"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000c1',
    'authenticated', 'authenticated',
    'tenant1@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Marie-Ange Bissessur"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000c2',
    'authenticated', 'authenticated',
    'tenant2@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Jean-Claude Veerasamy"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000d1',
    'authenticated', 'authenticated',
    'superadmin@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Superadmin GR Immo Suite"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000a2',
    'authenticated', 'authenticated',
    'admin2@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Sarah Appadoo"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000a3',
    'authenticated', 'authenticated',
    'agent1@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Kevin Lallmahomed"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000a4',
    'authenticated', 'authenticated',
    'agent2@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Priya Ramgoolam"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000a5',
    'authenticated', 'authenticated',
    'agent3@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Yannick Li"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000b2',
    'authenticated', 'authenticated',
    'owner-multi@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Nadia Peerthum"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000b3',
    'authenticated', 'authenticated',
    'owner-sold@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Marc Antoine Chan"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000b4',
    'authenticated', 'authenticated',
    'owner-vacant@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Farah Beebeejaun"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000b5',
    'authenticated', 'authenticated',
    'owner-empty@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Vikash Gopaul"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000c3',
    'authenticated', 'authenticated',
    'tenant-credit@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Ashwin Ramnauth"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000c4',
    'authenticated', 'authenticated',
    'tenant-nolease@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Louis Ah-Kim"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000c5',
    'authenticated', 'authenticated',
    'tenant-past@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Ravi Sunassee"}',
    false, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-0000000000b6',
    'authenticated', 'authenticated',
    'owner-land@grimmotest.mu',
    crypt('Password123!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Rajesh Bundhoo"}',
    false, now(), now()
  );

-- Générée depuis auth.users plutôt que listée à la main : mécanique et
-- identique pour tous les comptes (évite les typos sur 15 lignes répétitives).
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), u.id, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', now(), now(), now()
from auth.users u
where u.instance_id = '00000000-0000-0000-0000-000000000000';

-- ---------- PLATFORM ADMINS ----------
-- Hors modèle multi-tenant (pas de ligne profiles pour ce compte).
insert into platform_admins (user_id) values
  ('a0000000-0000-4000-8000-0000000000d1');

-- ---------- PROFILES ----------
insert into profiles (id, organization_id, role, full_name, email, phone) values
  ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001', 'admin', 'Admin GR Immo', 'admin@grimmotest.mu', '+230 5711 2233'),
  ('a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000001', 'owner', 'Devanand Ramsamy', 'owner@grimmotest.mu', '+230 5788 4455'),
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-000000000001', 'tenant', 'Marie-Ange Bissessur', 'tenant1@grimmotest.mu', '+230 5822 6677'),
  ('a0000000-0000-4000-8000-0000000000c2', 'a0000000-0000-4000-8000-000000000001', 'tenant', 'Jean-Claude Veerasamy', 'tenant2@grimmotest.mu', '+230 5933 8899'),
  ('a0000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-000000000001', 'admin', 'Sarah Appadoo', 'admin2@grimmotest.mu', '+230 5744 1122'),
  ('a0000000-0000-4000-8000-0000000000a3', 'a0000000-0000-4000-8000-000000000001', 'agent', 'Kevin Lallmahomed', 'agent1@grimmotest.mu', '+230 5755 2233'),
  ('a0000000-0000-4000-8000-0000000000a4', 'a0000000-0000-4000-8000-000000000001', 'agent', 'Priya Ramgoolam', 'agent2@grimmotest.mu', '+230 5766 3344'),
  ('a0000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-000000000001', 'agent', 'Yannick Li', 'agent3@grimmotest.mu', '+230 5777 4455'),
  ('a0000000-0000-4000-8000-0000000000b2', 'a0000000-0000-4000-8000-000000000001', 'owner', 'Nadia Peerthum', 'owner-multi@grimmotest.mu', '+230 5788 5566'),
  ('a0000000-0000-4000-8000-0000000000b3', 'a0000000-0000-4000-8000-000000000001', 'owner', 'Marc Antoine Chan', 'owner-sold@grimmotest.mu', '+230 5799 6677'),
  ('a0000000-0000-4000-8000-0000000000b4', 'a0000000-0000-4000-8000-000000000001', 'owner', 'Farah Beebeejaun', 'owner-vacant@grimmotest.mu', '+230 5700 7788'),
  ('a0000000-0000-4000-8000-0000000000b5', 'a0000000-0000-4000-8000-000000000001', 'owner', 'Vikash Gopaul', 'owner-empty@grimmotest.mu', '+230 5711 8899'),
  ('a0000000-0000-4000-8000-0000000000c3', 'a0000000-0000-4000-8000-000000000001', 'tenant', 'Ashwin Ramnauth', 'tenant-credit@grimmotest.mu', '+230 5822 9900'),
  ('a0000000-0000-4000-8000-0000000000c4', 'a0000000-0000-4000-8000-000000000001', 'tenant', 'Louis Ah-Kim', 'tenant-nolease@grimmotest.mu', '+230 5833 0011'),
  ('a0000000-0000-4000-8000-0000000000c5', 'a0000000-0000-4000-8000-000000000001', 'tenant', 'Ravi Sunassee', 'tenant-past@grimmotest.mu', '+230 5844 1122'),
  ('a0000000-0000-4000-8000-0000000000b6', 'a0000000-0000-4000-8000-000000000001', 'owner', 'Rajesh Bundhoo', 'owner-land@grimmotest.mu', '+230 5855 2233');

-- ---------- PROPERTIES ----------
-- P1 : Grand Baie, appartement loué (tenant1)
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, rooms, bedrooms, bathrooms, furnished, status,
  ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b1',
  'GB-101',
  'Résidence Les Alizés, Coastal Road',
  'Grand Baie',
  'Rivière du Rempart',
  '30512',
  'apartment', 85, 3, 2, 1, true, 'occupied',
  'freehold', 'MUR',
  'Appartement moderne à 5 minutes de la plage, vue partielle mer, résidence sécurisée.'
);

-- P2 : Quatre Bornes, maison louée (tenant2)
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, rooms, bedrooms, bathrooms, furnished, status,
  ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b1',
  'QB-202',
  '15 Rue du Levant',
  'Quatre Bornes',
  'Plaines Wilhems',
  '72201',
  'house', 140, 5, 3, 2, false, 'occupied',
  'freehold', 'MUR',
  'Maison familiale avec jardin, proche du marché de Quatre Bornes et des écoles.'
);

-- P3 : Rivière du Rempart, appartement vacant
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, rooms, bedrooms, bathrooms, furnished, status,
  ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b1',
  'RR-303',
  'Route Royale',
  'Rivière du Rempart',
  'Rivière du Rempart',
  '20601',
  'apartment', 65, 2, 1, 1, false, 'vacant',
  'res', 'MUR',
  'Petit appartement idéal pour jeune couple, proche du centre-ville et des transports.'
);

-- P4 : Tamarin, occupé par tenant-credit (bail actif avec trop-perçu)
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, rooms, bedrooms, bathrooms, furnished, status,
  ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b1',
  'TP-404',
  'Chemin Vingt Pieds',
  'Tamarin',
  'Rivière Noire',
  '90901',
  'apartment', 55, 2, 1, 1, true, 'occupied',
  'freehold', 'MUR',
  'Studio meublé proche de la plage de Tamarin.'
);

-- P5 : Pointe aux Piments, propriétaire owner-multi — annonce de vente active
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, rooms, bedrooms, bathrooms, furnished, status,
  ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b2',
  'PP-505',
  'Royal Road',
  'Pointe aux Piments',
  'Rivière du Rempart',
  '30924',
  'apartment', 95, 3, 2, 2, false, 'vacant',
  'irs', 'MUR',
  'Appartement de standing en bord de mer, vendu meublé.'
);

-- P6 : Trou aux Biches, propriétaire owner-sold — bien déjà vendu
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, rooms, bedrooms, bathrooms, furnished, status,
  ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b3',
  'TR-606',
  'Coastal Road',
  'Trou aux Biches',
  'Rivière du Rempart',
  '30513',
  'house', 180, 6, 4, 3, false, 'vacant',
  'freehold', 'MUR',
  'Villa avec piscine, vente finalisée en juillet 2026.'
);

-- P7 : Curepipe, propriétaire owner-vacant — uniquement des biens vacants, sans annonce
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, rooms, bedrooms, bathrooms, furnished, status,
  ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000007',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b4',
  'CU-707',
  'Rue Sir Winston Churchill',
  'Curepipe',
  'Plaines Wilhems',
  '74301',
  'office', 45, 2, 0, 1, false, 'vacant',
  'freehold', 'MUR',
  'Local commercial en rez-de-chaussée, actuellement sans locataire ni annonce.'
);

-- P8 : Bel Ombre, terrain du propriétaire owner-land — subdivisé en 2 lots (Phase 2b)
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, status, ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000008',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b6',
  'TN-909',
  'Route Côtière',
  'Bel Ombre',
  'Savanne',
  '90501',
  'land', 2500, 'vacant',
  'freehold', 'MUR',
  'Terrain non loti proche du littoral, subdivisé en 2 lots.'
);

-- P9/P10 : lots issus de TN-909 (parent_property_id renseigné en 0017, mis à jour ci-dessous)
insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, status, ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-000000000009',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b6',
  'TN-909-A',
  'Route Côtière, Lot A',
  'Bel Ombre',
  'Savanne',
  '90501',
  'land', 1200, 'vacant',
  'freehold', 'MUR',
  'Lot A issu de la subdivision de TN-909.'
);

insert into properties (
  id, organization_id, owner_id, reference, address_line, city, region, postal_code,
  property_type, surface_area, status, ownership_scheme, currency, description
) values (
  'b0000000-0000-4000-8000-00000000000a',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000b6',
  'TN-909-B',
  'Route Côtière, Lot B',
  'Bel Ombre',
  'Savanne',
  '90501',
  'land', 1300, 'vacant',
  'freehold', 'MUR',
  'Lot B issu de la subdivision de TN-909.'
);

update properties set parent_property_id = 'b0000000-0000-4000-8000-000000000008'
where id in ('b0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-00000000000a');

-- ---------- PROPERTY_OWNERS ----------
-- Un propriétaire à 100% pour la plupart des biens ; GB-101 est volontairement
-- co-détenu (60/40) pour tester l'affichage multi-propriétaire en UAT.
insert into property_owners (property_id, owner_id, ownership_percentage) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b1', 60),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000b2', 40),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000b1', 100),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000b1', 100),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-0000000000b1', 100),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-0000000000b2', 100),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-0000000000b3', 100),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-0000000000b4', 100),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-0000000000b6', 100),
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-0000000000b6', 100),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-0000000000b6', 100);

-- ---------- LEASES ----------
insert into leases (
  id, organization_id, property_id, status, start_date, end_date,
  rent_amount, charges_amount, deposit_amount, payment_day, lease_type, renewal_type
) values (
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'active', '2026-01-01', '2026-12-31',
  25000, 1500, 50000, 5, 'residential', 'tacit_renewal'
);

insert into leases (
  id, organization_id, property_id, status, start_date, end_date,
  rent_amount, charges_amount, deposit_amount, payment_day, lease_type, renewal_type
) values (
  'c0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'active', '2026-03-01', '2027-02-28',
  35000, 2000, 70000, 1, 'residential', 'fixed'
);

-- Bail 3 : tenant-credit, actif, TP-404 (trop-perçu construit plus bas)
insert into leases (
  id, organization_id, property_id, status, start_date, end_date,
  rent_amount, charges_amount, deposit_amount, payment_day, lease_type, renewal_type
) values (
  'c0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004',
  'active', '2026-02-01', '2027-01-31',
  20000, 0, 40000, 1, 'residential', 'tacit_renewal'
);

-- Bail 4 : tenant-past, terminé en 2025, sur RR-303 (aujourd'hui vacant)
insert into leases (
  id, organization_id, property_id, status, start_date, end_date,
  rent_amount, charges_amount, deposit_amount, payment_day, lease_type, renewal_type
) values (
  'c0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000003',
  'ended', '2025-01-01', '2025-12-31',
  18000, 0, 36000, 1, 'residential', 'fixed'
);

-- ---------- LEASE_TENANTS ----------
insert into lease_tenants (lease_id, tenant_id, is_primary) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000c1', true),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000c2', true),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000c3', true),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-0000000000c5', true);

-- ---------- BILLING (moteur générique, section 2 du complément v1.1) ----------
-- Un billing_account générique par bail (owner_entity_type = 'lease'), avec
-- son échéancier de charges et les paiements reçus. Les allocations sont
-- calculées par la vraie fonction allocate_payment(), pas saisies à la main.

insert into billing_accounts (id, organization_id, owner_entity_type, owner_entity_id, currency) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'lease', 'c0000000-0000-4000-8000-000000000001', 'MUR'),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'lease', 'c0000000-0000-4000-8000-000000000002', 'MUR'),
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'lease', 'c0000000-0000-4000-8000-000000000003', 'MUR');

insert into charge_schedules (id, billing_account_id, label, amount, frequency, day_of_period, start_date, active) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Loyer mensuel', 26500, 'monthly', 5, '2026-01-01', true),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'Loyer mensuel', 37000, 'monthly', 1, '2026-03-01', true),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'Loyer mensuel', 20000, 'monthly', 1, '2026-02-01', true);

-- Échéancier 3 mois par bail (GB-101 / tenant1, QB-202 / tenant2)
insert into charges (id, organization_id, billing_account_id, charge_schedule_id, category, description, amount, due_date, period_start, period_end, status) values
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'rent', 'Loyer mai 2026', 26500, '2026-05-05', '2026-05-01', '2026-05-31', 'open'),
  ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'rent', 'Loyer juin 2026', 26500, '2026-06-05', '2026-06-01', '2026-06-30', 'open'),
  ('f0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'rent', 'Loyer juillet 2026', 26500, '2026-07-05', '2026-07-01', '2026-07-31', 'open'),
  ('f0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'rent', 'Loyer mai 2026', 37000, '2026-05-01', '2026-05-01', '2026-05-31', 'open'),
  ('f0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'rent', 'Loyer juin 2026', 37000, '2026-06-01', '2026-06-01', '2026-06-30', 'open'),
  ('f0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'rent', 'Loyer juillet 2026', 37000, '2026-07-01', '2026-07-01', '2026-07-31', 'open'),
  ('f0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003', 'rent', 'Loyer juillet 2026', 20000, '2026-07-01', '2026-07-01', '2026-07-31', 'open');

-- Paiements reçus : bail 1 mai+juin payés (juillet reste dû) ; bail 2 mai
-- payé seulement (juin/juillet restent dus, juin étant échu = "en retard"
-- de fait puisque due_date < aujourd'hui, sans état "late" stocké séparément) ;
-- bail 3 (tenant-credit) payé en trop de 5000 -> crédit non affecté (Phase 3).
insert into payments (id, organization_id, billing_account_id, amount, payment_date, payment_method) values
  ('11110000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 26500, '2026-05-04', 'bank_transfer'),
  ('11110000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 26500, '2026-06-05', 'bank_transfer'),
  ('11110000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 37000, '2026-05-01', 'cheque'),
  ('11110000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 25000, '2026-07-01', 'bank_transfer');

select allocate_payment('11110000-0000-4000-8000-000000000001');
select allocate_payment('11110000-0000-4000-8000-000000000002');
select allocate_payment('11110000-0000-4000-8000-000000000003');
select allocate_payment('11110000-0000-4000-8000-000000000004');

-- ---------- MAINTENANCE REQUEST ----------
insert into maintenance_requests (
  organization_id, property_id, lease_id, reported_by, title, description, priority, status
) values (
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-0000000000c1',
  'Fuite au niveau du robinet de la salle de bain',
  'Le robinet de la salle de bain principale goutte en continu depuis 3 jours, risque de dégât des eaux.',
  'high',
  'open'
);

-- ---------- LISTINGS / SALES ----------
-- owner-multi (PP-505) : annonce de vente active, pas encore de sale ->
-- property_commercial_status = 'for_sale'.
insert into listings (id, organization_id, property_id, listing_type, status, price, currency, commission_rate) values
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'sale', 'active', 4500000, 'MUR', 3);

-- owner-sold (TR-606) : annonce de vente active + sale 'completed' liée ->
-- property_commercial_status = 'sold' (donnée nécessaire à la Phase 2).
insert into listings (id, organization_id, property_id, listing_type, status, price, currency, commission_rate) values
  ('10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006', 'sale', 'active', 6000000, 'MUR', 3);

insert into sales (id, organization_id, listing_id, buyer_name, buyer_contact, offer_price, agreed_price, status, compromis_date, deed_date, notary_name, commission_amount) values
  ('20000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Client Import Export Ltée', '+230 5211 3344', 5900000, 5800000, 'completed', '2026-05-15', '2026-07-01', 'Étude Maigrot & Associés', 174000);

-- ---------- CARNET D'ADRESSES (Phase 3) ----------
-- 3 cas de figure d'assurance couverts : expirée, bientôt expirée (<30j), à jour.
insert into address_book_contacts (organization_id, category, full_name, company_name, phone, email, license_number, insurance_expiry, notes) values
  ('a0000000-0000-4000-8000-000000000001', 'plumber', 'Anil Ramdoo', 'Ramdoo Plomberie', '+230 5911 2233', 'anil.ramdoo@example.mu', 'PL-4521', '2026-06-15', 'Assurance expirée — à relancer avant toute nouvelle intervention.'),
  ('a0000000-0000-4000-8000-000000000001', 'electrician', 'Steven Fanchette', 'FanchElec', '+230 5922 3344', 'steven.fanchette@example.mu', 'EL-1187', '2026-08-10', 'Assurance bientôt expirée.'),
  ('a0000000-0000-4000-8000-000000000001', 'notary', 'Me Aditi Beeharry', 'Étude Beeharry', '+230 5933 4455', 'contact@beeharry-notaire.mu', null, null, 'Notaire habituel pour les ventes.'),
  ('a0000000-0000-4000-8000-000000000001', 'general_contractor', 'Jean-Marc Li Wan Po', 'JMLWP Construction', '+230 5944 5566', 'jm.liwanpo@example.mu', 'GC-3390', '2027-03-01', 'Intervenu sur la rénovation de TR-606.'),
  ('a0000000-0000-4000-8000-000000000001', 'land_surveyor', 'Kevin Rughoobur', null, '+230 5955 6677', null, 'GEO-778', null, 'Pour le bornage des lots TN-909-A/B.');
