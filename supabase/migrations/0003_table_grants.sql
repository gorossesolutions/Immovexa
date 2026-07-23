-- ============================================================
-- GRANTS — prérequis obligatoire pour que les policies RLS
-- de 0001_init.sql puissent s'appliquer.
--
-- RLS filtre les LIGNES, mais Postgres exige en plus un GRANT
-- de base (SELECT/INSERT/UPDATE/DELETE) sur la TABLE pour le
-- rôle courant, sinon l'accès est refusé avant même que la RLS
-- soit évaluée. Studio le fait automatiquement à la création
-- d'une table ; en SQL brut il faut l'expliciter.
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  organizations,
  branding_settings,
  profiles,
  properties,
  leases,
  lease_tenants,
  payments,
  documents,
  maintenance_requests,
  maintenance_comments,
  activity_log,
  notifications
to authenticated;

-- branding_settings a une policy de lecture publique (branding_public_read),
-- donc anon (utilisateur non connecté, ex: écran de login en marque blanche)
-- doit pouvoir la lire.
grant select on branding_settings to anon;
