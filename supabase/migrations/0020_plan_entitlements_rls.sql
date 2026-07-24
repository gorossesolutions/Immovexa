-- ============================================================
-- SÉCURITÉ — plan_entitlements n'avait aucune RLS (table exposée en
-- lecture/écriture à tout utilisateur authentifié). C'est une table
-- GLOBALE (grille de fonctionnalités par plan, pas scopée par
-- organisation) — la verrouiller à "admin/agent" serait une faille :
-- n'importe quel admin d'organisation pourrait s'auto-attribuer les
-- entitlements d'un plan supérieur. Seul le superadmin plateforme
-- (is_platform_admin(), 0009) doit pouvoir la modifier.
-- Lecture : has_entitlement() est déjà security definer (0010), donc
-- cette RLS n'affecte pas son fonctionnement normal.
-- ============================================================

alter table plan_entitlements enable row level security;

create policy "plan_entitlements_platform_admin_write" on plan_entitlements
  for all using (is_platform_admin());

-- Lecture publique nécessaire : has_entitlement() est appelée côté
-- client (router) pour des utilisateurs qui ne sont pas superadmin ;
-- security definer bypass la RLS pour la fonction elle-même, mais un
-- accès direct en lecture reste inoffensif (pas de donnée sensible,
-- juste la grille des plans) et évite toute régression imprévue.
create policy "plan_entitlements_authenticated_read" on plan_entitlements
  for select using (true);
