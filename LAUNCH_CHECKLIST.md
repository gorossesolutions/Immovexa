# Checklist avant mise en production

À vérifier avant d'ouvrir Immovexa à de vrais utilisateurs.

## 1. Données

- [ ] **Vider les données de seed** si `supabase/seed.sql` a jamais été exécuté sur ce projet (comptes de test `*@grimmotest.mu`, mot de passe partagé `Password123!`, biens/baux/paiements fictifs). `seed.sql` refuse maintenant de s'exécuter si `organizations` contient déjà des données — mais vérifier qu'aucune donnée de test n'est restée d'un essai précédent.
- [ ] Créer le ou les vrais comptes admin de l'organisation, avec de vrais mots de passe (jamais `Password123!`).
- [ ] Supprimer/désactiver tout compte de test superflu (`admin2`, `agent1/2/3`, `owner-*`, `tenant-*`).

## 2. Base de données

- [ ] Confirmer que toutes les migrations sont appliquées (`npx supabase migration list` — colonnes `local`/`remote` identiques).
- [ ] Vérifier qu'aucune table n'a la RLS désactivée (on a déjà corrigé `plan_entitlements` en cours de route — vérifier qu'aucune autre table créée depuis n'a été oubliée).
- [ ] Vérifier que chaque nouvelle table a bien reçu ses GRANT (`authenticated` **et** `service_role` — piège rencontré deux fois cette session, RLS seule ne suffit pas).
- [ ] Mettre en place des sauvegardes régulières (Supabase Cloud propose des backups automatiques selon le plan — vérifier qu'ils sont activés).

## 3. Configuration Netlify / déploiement

- [ ] Variables d'environnement (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) pointent bien vers le projet Supabase Cloud de production, pas vers un environnement local ou de test.
- [ ] Domaine personnalisé configuré si prévu (actuellement `immovexa.netlify.app`).
- [ ] Confirmer que `main` reste la seule branche déployée en production, `dev` en preview.

## 4. Fonctionnalités non finalisées à garder en tête

- [ ] **Phase 5 (invitations brandées)** : reportée. Les propriétaires/locataires importés par CSV reçoivent aujourd'hui l'email d'invitation générique de Supabase, pas encore aux couleurs de l'organisation.
- [ ] **Traduction FR/EN** : discutée mais pas commencée — chantier à part entière.
- [ ] `properties.owner_id` : conservée mais dépréciée (plus utilisée par le code, remplacée par `property_owners`). Prévoir sa suppression définitive une fois confirmé que rien n'y touche plus, dans une migration séparée.

## 5. Sécurité

- [ ] Edge Functions : les CORS actuels (`Access-Control-Allow-Origin: *`) sont larges — resserrer au domaine de prod si besoin.
- [ ] Revérifier qu'aucune clé `service_role` ni jeton ne se trouve dans le code front-end ou dans un commit.
- [ ] Confirmer que le superadmin plateforme (`platform_admins`) est limité aux bonnes personnes.

## 6. Test final

- [ ] Se connecter avec un vrai compte de chaque rôle (admin, propriétaire, locataire) sur l'environnement de production et vérifier le parcours de base (dashboard, création d'un bien, paiement, document).
- [ ] Vérifier l'affichage mobile sur un vrai téléphone, pas seulement en émulation navigateur.
