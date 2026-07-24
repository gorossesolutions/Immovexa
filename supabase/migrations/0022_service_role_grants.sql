-- ============================================================
-- GRANT service_role — découverte en testant l'import CSV (Edge
-- Function utilisant SUPABASE_SERVICE_ROLE_KEY) : contrairement à
-- l'hypothèse habituelle, service_role n'a pas d'accès implicite aux
-- tables dans cette version de Postgres/Supabase, uniquement le
-- bypass RLS. Même prérequis que 0003 (authenticated) et 0016
-- (property_owners), mais jamais fait pour service_role.
-- Confirmé en direct : erreur PostgREST "permission denied for table
-- profiles" avec la vraie service role key, message suggérant
-- exactement ce GRANT.
-- ============================================================

grant select, insert, update, delete on profiles to service_role;
