-- ============================================================
-- COMMISSION PAR BIEN — taux d'accord par défaut (indépendant d'une
-- annonce précise, listings.commission_rate existant reste inchangé
-- et sert au moment de la vente/location). Ce champ permet de tracer
-- un accord (éventuellement "en off") au niveau du bien, hérité par
-- les lots lors d'une subdivision, mais toujours éditable ensuite.
-- 0 est une valeur valide (pas de commission convenue).
-- ============================================================

alter table properties add column commission_rate numeric;
