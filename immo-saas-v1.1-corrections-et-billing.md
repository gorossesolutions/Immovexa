# GR Immo Suite — V1.1 : Corrections, moteur comptable, restructuration vente/location
> Complément à SPEC.md. À donner à Claude Code en une fois, avec les deux fichiers dans le repo.

---

## 0. Principe d'architecture : isolation sectorielle

**Règle absolue pour la suite du projet** : tout module métier propre à l'immobilier doit être remplaçable sans toucher au cœur du produit. Le cœur (auth, organisations, documents, notifications, facturation) ne doit **jamais** connaître le mot "bail", "propriétaire" ou "locataire".

```
src/modules/
├── core/            ← agnostique, ne change jamais selon le secteur
│   ├── auth/
│   ├── organizations/
│   ├── documents/
│   ├── notifications/
│   └── branding/
├── billing/         ← agnostique, moteur de facturation générique (section 2)
│   ├── billing-accounts.ts
│   ├── charges.ts
│   ├── payments.ts
│   └── allocation-engine.ts
└── real-estate/     ← spécifique secteur immo, "branché" sur core + billing
    ├── properties.ts
    ├── listings.ts
    ├── leases.ts
    ├── sales.ts
    ├── short-term-bookings.ts
    └── maintenance.ts
```

**Conséquence concrète en base de données** : le module `billing` ne référence jamais `lease_id` directement. Il référence un `billing_account_id` générique, et c'est le module `real-estate` qui crée un `billing_account` pour chaque bail. Un futur module `healthcare` créerait un `billing_account` pour chaque dossier patient, en réutilisant exactement le même moteur de charges/paiements/allocations — zéro ligne de `billing` à modifier.

---

## 1. Bugs à corriger (session actuelle)

### 1.1 Mode sombre illisible — 3 endroits
Détail d'un bien, les 2 tableaux du détail d'un bail, les 2 tableaux du détail d'une maintenance.
**Cause probable** : couleurs de texte/fond en dur (`text-slate-900`, `bg-white`) au lieu des variables de thème ou des classes `dark:` de Tailwind.
**Fix** : auditer tous les composants de tableau de détail, remplacer les couleurs en dur par les tokens `--color-neutral` / `--color-primary` définis en section 6 de SPEC.md, ou ajouter systématiquement les variantes `dark:bg-*` / `dark:text-*`. Faire un composant `<detail-table>` unique réutilisé partout plutôt que des tableaux dupliqués — ça évite que le bug réapparaisse ailleurs.

### 1.2 Section Paiements — date de paiement
Le champ date dans "Marquer comme payé" doit refuser toute date postérieure à aujourd'hui.
**Fix** : attribut HTML `max="{today}"` sur l'input date + validation JS bloquante avant soumission (ne pas se reposer sur l'attribut HTML seul, certains navigateurs mobiles l'ignorent).

### 1.3 Section Paiements — montant dû non recalculé
Résolu structurellement par le moteur de ledger (section 2) : le montant dû n'est plus un champ stocké et édité à la main, il est **calculé** à chaque affichage (`charge.amount - somme des allocations`). Il ne peut donc plus se désynchroniser.

### 1.4 Section Paiements — paiements récurrents
Résolu par `charge_schedules` (section 2.2). Copy UI proposée pour la création d'un paiement/charge :

> **"Ce loyer se répète-t-il chaque mois ?"**
> ○ Non, c'est une charge ponctuelle
> ○ Oui, générer automatiquement chaque mois

Éviter le jargon "récurrent vs unique" — le libellé ci-dessus est plus naturel pour un utilisateur non-tech.

### 1.5 Section Documents
- Ajouter une icône œil à côté de "Télécharger" → ouvre une modale avec le PDF affiché inline (`<iframe>` ou `<embed>` pointant vers l'URL signée Supabase Storage, `type="application/pdf"`). Pas de PDF.js nécessaire pour du simple affichage, les navigateurs modernes rendent les PDF nativement dans une iframe.
- Boutons "Télécharger" et "Supprimer" : les convertir en vrais boutons (`<button>` avec padding, radius, fond plein) au lieu de liens texte — bleu (`--color-secondary`) pour télécharger, rouge (`--color-danger`, à ajouter aux tokens si absent) pour supprimer.

### 1.6 Section Maintenance — statuts en français
Remplacer les valeurs techniques affichées telles quelles par un mapping de libellés :

| Valeur DB | Libellé affiché |
|---|---|
| `open` | Ouvert |
| `in_progress` | En cours |
| `resolved` | Résolu |
| `closed` | Clôturé |

Centraliser ce mapping dans un seul fichier `src/lib/status-labels.ts` (un objet par entité : maintenance, lease, payment, listing...) — pas de traduction en dur dispersée dans les composants.

### 1.7 Paramètres — branding non appliqué
Le nom et le logo sont enregistrés en base mais jamais lus par le layout. **Fix** :
- Le `display_name` de `branding_settings` doit remplacer "GR Immo Suite" partout : `<title>`, en-tête de la sidebar, footer si présent.
- Le logo doit s'afficher **en haut de la sidebar, au-dessus ou à côté du nom** (emplacement standard SaaS — c'est le premier élément que l'œil rencontre, cohérence de marque immédiate). Prévoir un fallback (juste le nom en texte) si `logo_url` est vide, pour ne pas casser le layout sur une org sans logo.
- Rappel technique : `applyBranding()` (section 6.3 de SPEC.md) doit être appelé au tout début du bootstrap (`main.ts`), avant le premier rendu, sinon flash de l'ancien branding.

### 1.8 Paramètres — quick color presets
Ajouter des presets en plus des 4 color pickers libres. Chaque preset définit primary/secondary/accent/neutral en un clic :

| Preset | Primary | Secondary | Accent | Neutral | Positionnement |
|---|---|---|---|---|---|
| Bleu Corporate (défaut) | `#0f172a` | `#0067ff` | `#e7f6ff` | `#364151` | Agence généraliste, sérieux |
| Émeraude Confiance | `#0f2e1d` | `#059669` | `#d1fae5` | `#374151` | Évoque gestion/rentabilité financière |
| Terracotta Premium | `#2d2420` | `#c9917a` | `#faf8f5` | `#57534e` | Immobilier haut de gamme, chaleureux |
| Anthracite Minimal | `#18181b` | `#6366f1` | `#eef2ff` | `#3f3f46` | Agence moderne, très épurée |
| Bleu Marine Classique | `#0c1e3d` | `#1d4ed8` | `#dbeafe` | `#334155` | Agence traditionnelle, patrimoniale |

Chaque preset a été choisi pour garder un contraste texte/fond suffisant en mode clair ET sombre (accent toujours très clair, primary toujours très foncé). Les color pickers libres restent disponibles en dessous pour un ajustement fin après sélection d'un preset.

---

## 2. Moteur de facturation générique (module `billing`)

### 2.1 Principe
On remplace la table `payments` plate par un vrai ledger : des **charges** (ce qui est dû) et des **paiements** (ce qui est reçu), reliés par une table d'**allocations** qui répartit chaque paiement sur une ou plusieurs charges. C'est ce qui permet le trop-perçu automatique, les paiements partiels propres, et l'historique complet — sans jamais éditer un montant à la main.

### 2.2 Schéma SQL

```sql
-- ============================================================
-- BILLING ACCOUNTS — ancre générique, jamais liée directement à "lease"
-- ============================================================
create table billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_entity_type text not null,   -- 'lease' pour l'immo ; libre pour d'autres secteurs
  owner_entity_id uuid not null,     -- ex: leases.id
  currency text not null default 'MUR',
  created_at timestamptz not null default now(),
  unique (owner_entity_type, owner_entity_id)
);

create index idx_billing_accounts_owner on billing_accounts(owner_entity_type, owner_entity_id);

-- ============================================================
-- CHARGE SCHEDULES — génère les charges récurrentes automatiquement
-- ============================================================
create table charge_schedules (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references billing_accounts(id) on delete cascade,
  label text not null,                  -- ex: "Loyer mensuel"
  amount numeric not null,
  frequency text not null check (frequency in ('monthly','weekly','one_time')),
  day_of_period integer,                -- jour du mois de génération (1-28)
  start_date date not null,
  end_date date,                        -- null = indéfini, aligné sur la fin du bail
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CHARGES — ce qui est dû
-- ============================================================
create table charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  billing_account_id uuid not null references billing_accounts(id) on delete cascade,
  charge_schedule_id uuid references charge_schedules(id),  -- null si charge ponctuelle
  category text not null check (category in ('rent','late_fee','deposit','service_charge','other')),
  description text,
  amount numeric not null,
  due_date date not null,
  period_start date,
  period_end date,
  status text not null default 'open' check (status in ('open','partially_paid','paid','waived')),
  created_at timestamptz not null default now()
);

create index idx_charges_billing_account on charges(billing_account_id, due_date);
create index idx_charges_status on charges(status);

-- ============================================================
-- PAYMENTS — ce qui est reçu
-- ============================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  billing_account_id uuid not null references billing_accounts(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null check (payment_date <= current_date),
  payment_method text check (payment_method in ('bank_transfer','cash','cheque','other')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_payments_billing_account on payments(billing_account_id, payment_date);

-- ============================================================
-- PAYMENT ALLOCATIONS — répartit un paiement sur une ou plusieurs charges
-- ============================================================
create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  charge_id uuid not null references charges(id) on delete cascade,
  amount_allocated numeric not null check (amount_allocated > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, charge_id)
);

create index idx_allocations_payment on payment_allocations(payment_id);
create index idx_allocations_charge on payment_allocations(charge_id);

-- ============================================================
-- LATE FEE RULES — optionnel, activable par organisation
-- ============================================================
create table late_fee_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  grace_period_days integer not null default 5,
  fee_type text not null check (fee_type in ('flat','percentage')),
  fee_value numeric not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
```

### 2.3 Vues calculées (jamais de champ stocké à désynchroniser)

```sql
-- Montant dû restant par charge = amount - somme des allocations reçues
create view charge_balances as
select
  c.id as charge_id,
  c.amount,
  coalesce(sum(pa.amount_allocated), 0) as amount_paid,
  c.amount - coalesce(sum(pa.amount_allocated), 0) as amount_due
from charges c
left join payment_allocations pa on pa.charge_id = c.id
group by c.id, c.amount;

-- Crédit non alloué par paiement = amount - somme des allocations données
create view payment_unallocated as
select
  p.id as payment_id,
  p.billing_account_id,
  p.amount,
  coalesce(sum(pa.amount_allocated), 0) as amount_allocated,
  p.amount - coalesce(sum(pa.amount_allocated), 0) as amount_unallocated
from payments p
left join payment_allocations pa on pa.payment_id = p.id
group by p.id, p.billing_account_id, p.amount;

-- Solde de crédit disponible par compte (trop-perçu à réutiliser sur la prochaine charge)
create view billing_account_credit as
select billing_account_id, sum(amount_unallocated) as available_credit
from payment_unallocated
where amount_unallocated > 0
group by billing_account_id;
```

### 2.4 Algorithme d'allocation (fonction Postgres, appelée à chaque paiement ET à chaque nouvelle charge)

**À l'enregistrement d'un paiement** (`allocate_payment(payment_id)`) :
1. Récupérer les charges `open`/`partially_paid` du `billing_account`, triées par `due_date` croissant (les plus anciennes d'abord).
2. Pour chaque charge, allouer `min(montant restant du paiement, solde dû de la charge)` via une ligne dans `payment_allocations`.
3. Mettre à jour `charges.status` (`paid` si solde à 0, `partially_paid` sinon).
4. Si le paiement dépasse toutes les charges ouvertes, le reliquat reste **non alloué** sur ce paiement (visible via `payment_unallocated`) — c'est le trop-perçu, prêt à être utilisé.

**À la génération d'une nouvelle charge** (`apply_credit_to_charge(charge_id)`), appelée juste après l'insertion d'une charge issue d'un `charge_schedule` :
1. Vérifier `billing_account_credit` pour ce compte.
2. S'il y a du crédit disponible, créer automatiquement les `payment_allocations` nécessaires (en piochant dans les paiements les plus anciens ayant un reliquat) pour couvrir tout ou partie de la nouvelle charge.
3. Résultat : un locataire qui a payé 2 mois d'avance voit son mois suivant déjà marqué "payé" (ou partiellement) sans aucune saisie manuelle — exactement le comportement demandé.

**Frais de retard** (si `late_fee_rules.active = true`) : job quotidien (Supabase Edge Function + `pg_cron`) qui scanne les charges `open`/`partially_paid` dont `due_date + grace_period_days < today` et n'ayant pas déjà de frais de retard associé (via une charge liée en `category = 'late_fee'` avec un `charge_schedule_id` pointant vers la charge d'origine, ou un champ `related_charge_id` à ajouter si besoin), puis crée la charge de frais correspondante.

### 2.5 Ce que ça change côté module `real-estate`

- À la création d'un bail actif, créer automatiquement : 1 `billing_account` (`owner_entity_type = 'lease'`) + 1 `charge_schedule` (loyer mensuel, montant = `leases.rent_amount`, `frequency = 'monthly'`, `day_of_period = leases.payment_day`).
- Supprimer l'ancienne table `payments` (celle liée à `lease_id` directement, définie dans SPEC.md section 3) et migrer vers le nouveau `billing_accounts` + `charges` + `payments` génériques.
- L'écran "Paiements" du portail admin devient une vue qui **joint** `charges` + `charge_balances` + `leases` (via `billing_accounts.owner_entity_id`) pour afficher le contexte immo, mais toute la logique de calcul reste dans le module `billing`.

---

## 3. Restructuration vente / location (rappel de la session précédente, à inclure dans ce batch)

Patch à appliquer sur le schéma de SPEC.md — détail complet déjà validé :

```sql
alter table properties drop column monthly_rent;
alter table properties drop column deposit_amount;
alter table properties add column ownership_scheme text
  check (ownership_scheme in ('freehold','irs','res','pds','ghs','none'));

create table listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  listing_type text not null check (listing_type in ('sale','long_term_rental','short_term_rental')),
  status text not null default 'draft' check (status in ('draft','active','under_offer','closed','archived')),
  price numeric,
  monthly_rent numeric,
  nightly_rate numeric,
  currency text not null default 'MUR',
  commission_rate numeric,
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  buyer_name text not null,
  buyer_contact text,
  offer_price numeric,
  agreed_price numeric,
  status text not null default 'offer' check (status in ('offer','compromis','deed_pending','completed','cancelled')),
  compromis_date date,
  deed_date date,
  notary_name text,
  commission_amount numeric,
  notes text,
  created_at timestamptz not null default now()
);

alter table leases add column listing_id uuid references listings(id);

create table short_term_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  guest_name text not null,
  guest_contact text,
  check_in date not null,
  check_out date not null,
  nights integer generated always as (check_out - check_in) stored,
  nightly_rate numeric not null,
  total_amount numeric not null,
  deposit_amount numeric,
  amount_paid numeric not null default 0,
  status text not null default 'confirmed' check (status in ('confirmed','checked_in','checked_out','cancelled')),
  source text default 'direct' check (source in ('direct','airbnb','booking_com','other')),
  created_at timestamptz not null default now()
);
```

**Règle de CTA validée** (recherche session précédente) : "Voir la facture" / "Voir le paiement" n'apparaît **jamais** sur un `listing`. Uniquement sur le détail d'un `lease` (renvoie vers son `billing_account`), d'une `short_term_booking`, ou d'une `sale` (renvoie vers sa commission).

---

## 4. Scope restant (rappel, inchangé)

1. **Portail owner** (lecture seule) — dashboard biens/revenus/occupation, détail bien, documents partagés, historique paiements (lecture des `charges`/`payments` via jointure `billing_account`). Réutiliser `data-table`, `status-badge`, `nav-sidebar` en mode restreint.
2. **Portail tenant** — dashboard bail actif, détail bail, historique paiements + téléchargement quittances, documents partagés, création/suivi maintenance.
3. **Edge Function PDF** (Deno + `pdf-lib`) — génération quittance (depuis une `charge` payée) et avis d'échéance (depuis une `charge` `open`).
4. **Polish** — KPIs dashboard admin (impayés = somme `charge_balances.amount_due` où `status != paid`, biens vacants, baux expirant sous 60j), notifications in-app, vérification responsive mobile.

---

## 5. Ordre de build recommandé pour ce batch

1. Corriger les bugs CSS dark mode + boutons documents + statuts traduits (rapide, isolé, zéro dépendance)
2. Appliquer le patch vente/location (section 3)
3. Migrer vers le moteur de billing générique (section 2) — le plus gros morceau, à tester unitairement sur l'algorithme d'allocation avant de brancher l'UI
4. Corriger branding (nom + logo affichés) + quick presets
5. Reprendre le scope restant (section 4) dans l'ordre initial
