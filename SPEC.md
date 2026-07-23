# GR Immo Suite — Spec technique V1
> SaaS de gestion locative multi-portails (Agence / Propriétaire / Locataire) — marque blanche, prêt pour le marché mauricien.
> Ce document est conçu pour être donné tel quel à Claude Code comme brief de projet (`CLAUDE.md` ou `SPEC.md` à la racine du repo).

---

## 0. Objectif du produit

Une plateforme web où une agence immobilière (ou un gestionnaire indépendant) héberge tous ses biens, baux, paiements et documents, avec un accès cloisonné pour chaque propriétaire (ses biens uniquement) et chaque locataire (son bail uniquement). Zéro dépendance à WhatsApp ou à un outil tiers no-code. Le produit est vendable en marque blanche : nom, logo et palette sont paramétrables par organisation depuis un panneau admin, sans toucher au code.

**V1 = produit complet et utilisable en production**, pas une démo. Ce qui est volontairement hors scope V1 est listé en section 9, avec justification.

---

## 1. Stack technique retenue

| Couche | Choix | Pourquoi |
|---|---|---|
| Frontend | **Vite + TypeScript (vanilla, sans framework JS lourd)** | Colle à ton affinité HTML/CSS/JS, zéro overhead React/Vue, build ultra-rapide, Claude Code scaffold ça très proprement. Architecture en modules ES + petit routeur maison (pas de dépendance router externe). |
| Styles | **Tailwind CSS v4 (config CSS-first)** | Les couleurs de marque sont des `@theme` liées à des variables CSS (`--color-primary`, etc.) injectées au runtime depuis la base — donc le repalettage est un changement de données, pas de code. |
| Backend / DB | **Supabase (Postgres + Auth + Storage + Row Level Security + Edge Functions)** | Tu le connais déjà, zéro serveur à gérer, RLS = le cloisonnement agence/propriétaire/locataire se fait nativement en base, pas en code applicatif (donc pas de faille si le frontend est buggé). |
| Génération PDF (quittances, avis d'échéance) | **Supabase Edge Function (Deno) + librairie `pdf-lib`** | Génération côté serveur = cohérence garantie, pas de dépendance à un service externe payant. |
| Hébergement | **Netlify** (déjà dans ton stack) | Déploiement du build Vite statique, variables d'env via Netlify UI. |
| Auth | **Supabase Auth (email/password + magic link)** | Pas de social login nécessaire en V1 — un locataire ou propriétaire mauricien n'attend pas de "Sign in with Google". |

**Pourquoi pas Next.js/React** : tu n'as pas besoin de SSR ni d'un écosystème de composants lourd pour un CRUD multi-rôles. Un SPA Vite + Supabase se déploie en 2 minutes sur Netlify, se maintient facilement seul, et reste 100% dans ta zone de confort technique. Si un jour tu as besoin de SEO public (page vitrine de biens à louer), on ajoutera Astro en façade — pas avant.

---

## 2. Modèle de rôles et multi-tenant

Le produit est multi-organisation dès la V1 (indispensable pour le vendre à plusieurs agences en marque blanche, pas juste à un client unique).

```
organization (1 agence cliente)
 ├── admin        → staff de l'agence, accès total sur l'org
 ├── agent        → staff limité (pas accès aux settings de marque/facturation)
 ├── owner        → propriétaire, voit uniquement SES biens
 └── tenant       → locataire, voit uniquement SON bail actif
```

Un `profiles.id` = un `auth.users.id` Supabase. Un profil appartient à une seule organisation et un seul rôle en V1 (pas de multi-casquette — un propriétaire qui est aussi locataire ailleurs aurait deux comptes, c'est acceptable en V1).

---

## 3. Schéma de base de données (SQL complet, Supabase-ready)

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- ORGANIZATIONS (marque blanche / multi-tenant)
-- ============================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  currency text not null default 'MUR' check (currency in ('MUR','EUR','USD')),
  locale text not null default 'fr',
  plan text not null default 'starter' check (plan in ('starter','boost','kickstart')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- BRANDING SETTINGS (1-1 avec organizations, éditable en admin)
-- ============================================================
create table branding_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  display_name text not null,
  logo_url text,
  favicon_url text,
  primary_color text not null default '#0f172a',
  secondary_color text not null default '#0067ff',
  accent_color text not null default '#e7f6ff',
  neutral_color text not null default '#364151',
  font_family text not null default 'Inter',
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROFILES (étend auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('admin','agent','owner','tenant')),
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index idx_profiles_org on profiles(organization_id);
create index idx_profiles_role on profiles(role);

-- ============================================================
-- PROPERTIES (biens)
-- ============================================================
create table properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references profiles(id),
  reference text not null,
  address_line text not null,
  city text not null,
  region text,                     -- district mauricien (Rivière du Rempart, Plaines Wilhems...)
  postal_code text,
  property_type text not null check (property_type in ('apartment','house','office','commercial','land','other')),
  surface_area numeric,
  rooms integer,
  bedrooms integer,
  bathrooms integer,
  furnished boolean not null default false,
  status text not null default 'vacant' check (status in ('vacant','occupied','maintenance','archived')),
  monthly_rent numeric not null,
  deposit_amount numeric,
  currency text not null default 'MUR' check (currency in ('MUR','EUR','USD')),
  description text,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);

create index idx_properties_org on properties(organization_id);
create index idx_properties_owner on properties(owner_id);

-- ============================================================
-- LEASES (baux)
-- ============================================================
create table leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','active','ended','terminated')),
  start_date date not null,
  end_date date,
  rent_amount numeric not null,
  charges_amount numeric not null default 0,
  deposit_amount numeric,
  payment_day integer not null default 1 check (payment_day between 1 and 28),
  lease_type text not null default 'residential' check (lease_type in ('residential','commercial','seasonal')),
  renewal_type text not null default 'fixed' check (renewal_type in ('fixed','tacit_renewal')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_leases_org on leases(organization_id);
create index idx_leases_property on leases(property_id);
create index idx_leases_status on leases(status);

-- ============================================================
-- LEASE_TENANTS (colocataires — many-to-many)
-- ============================================================
create table lease_tenants (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references leases(id) on delete cascade,
  tenant_id uuid not null references profiles(id),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (lease_id, tenant_id)
);

create index idx_lease_tenants_lease on lease_tenants(lease_id);
create index idx_lease_tenants_tenant on lease_tenants(tenant_id);

-- ============================================================
-- PAYMENTS (loyers / échéances)
-- ============================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lease_id uuid not null references leases(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  amount_due numeric not null,
  amount_paid numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','partial','paid','late','waived')),
  paid_date date,
  payment_method text check (payment_method in ('bank_transfer','cash','cheque','other')),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_payments_org on payments(organization_id);
create index idx_payments_lease on payments(lease_id);
create index idx_payments_status on payments(status);
create index idx_payments_due_date on payments(due_date);

-- ============================================================
-- DOCUMENTS (polymorphe — héberge tous les fichiers)
-- ============================================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('property','lease','payment','tenant','owner','maintenance','organization')),
  entity_id uuid not null,
  category text not null check (category in (
    'lease_contract','id_document','inventory_checkin','inventory_checkout',
    'receipt','invoice','diagnostic','insurance','other'
  )),
  file_name text not null,
  file_path text not null,       -- chemin dans Supabase Storage
  file_size integer,
  mime_type text,
  uploaded_by uuid not null references profiles(id),
  visibility text not null default 'shared' check (visibility in ('admin_only','owner_shared','tenant_shared','shared')),
  created_at timestamptz not null default now()
);

create index idx_documents_org on documents(organization_id);
create index idx_documents_entity on documents(entity_type, entity_id);

-- ============================================================
-- MAINTENANCE REQUESTS (demandes d'intervention — remplace le chat)
-- ============================================================
create table maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  lease_id uuid references leases(id),
  reported_by uuid not null references profiles(id),
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_maintenance_org on maintenance_requests(organization_id);
create index idx_maintenance_property on maintenance_requests(property_id);

create table maintenance_comments (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references maintenance_requests(id) on delete cascade,
  author_id uuid not null references profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);

create index idx_maintenance_comments_request on maintenance_comments(maintenance_request_id);

-- ============================================================
-- ACTIVITY LOG (audit trail)
-- ============================================================
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null,              -- ex: 'lease.created', 'payment.marked_paid'
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_org on activity_log(organization_id);
create index idx_activity_entity on activity_log(entity_type, entity_id);

-- ============================================================
-- NOTIFICATIONS (in-app uniquement, pas d'email/WhatsApp en V1)
-- ============================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_profile on notifications(profile_id, read_at);
```

---

## 4. Row Level Security — pattern et policies de référence

Principe : **jamais de filtrage de rôle côté frontend seul**. Toute la logique de cloisonnement vit en RLS. Le frontend affiche ce que Postgres autorise, point.

```sql
-- Active RLS partout
alter table organizations enable row level security;
alter table branding_settings enable row level security;
alter table profiles enable row level security;
alter table properties enable row level security;
alter table leases enable row level security;
alter table lease_tenants enable row level security;
alter table payments enable row level security;
alter table documents enable row level security;
alter table maintenance_requests enable row level security;
alter table maintenance_comments enable row level security;
alter table activity_log enable row level security;
alter table notifications enable row level security;

-- Fonction utilitaire : récupère le profil courant
create or replace function current_profile()
returns profiles
language sql stable security definer
as $$
  select * from profiles where id = auth.uid();
$$;

-- ---------- PROFILES ----------
create policy "profiles_select_own_org" on profiles
  for select using (organization_id = (current_profile()).organization_id);

create policy "profiles_admin_manage" on profiles
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

-- ---------- PROPERTIES ----------
-- Admin/agent : accès total sur leur org
create policy "properties_staff_all" on properties
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

-- Owner : lecture seule sur SES biens
create policy "properties_owner_read" on properties
  for select using (
    (current_profile()).role = 'owner'
    and owner_id = auth.uid()
  );

-- Tenant : lecture seule sur le bien lié à son bail actif
create policy "properties_tenant_read" on properties
  for select using (
    (current_profile()).role = 'tenant'
    and id in (
      select l.property_id from leases l
      join lease_tenants lt on lt.lease_id = l.id
      where lt.tenant_id = auth.uid() and l.status = 'active'
    )
  );

-- ---------- LEASES ----------
create policy "leases_staff_all" on leases
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "leases_owner_read" on leases
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select id from properties where owner_id = auth.uid())
  );

create policy "leases_tenant_read" on leases
  for select using (
    (current_profile()).role = 'tenant'
    and id in (select lease_id from lease_tenants where tenant_id = auth.uid())
  );

-- ---------- PAYMENTS ----------
create policy "payments_staff_all" on payments
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "payments_owner_read" on payments
  for select using (
    (current_profile()).role = 'owner'
    and lease_id in (
      select l.id from leases l
      join properties p on p.id = l.property_id
      where p.owner_id = auth.uid()
    )
  );

create policy "payments_tenant_read" on payments
  for select using (
    (current_profile()).role = 'tenant'
    and lease_id in (select lease_id from lease_tenants where tenant_id = auth.uid())
  );

-- ---------- DOCUMENTS ----------
create policy "documents_staff_all" on documents
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "documents_owner_read" on documents
  for select using (
    (current_profile()).role = 'owner'
    and visibility in ('owner_shared','shared')
    and organization_id = (current_profile()).organization_id
    -- filtrage fin par entity_id fait côté requête applicative (property/lease appartenant au owner)
  );

create policy "documents_tenant_read" on documents
  for select using (
    (current_profile()).role = 'tenant'
    and visibility in ('tenant_shared','shared')
    and organization_id = (current_profile()).organization_id
  );

-- ---------- MAINTENANCE ----------
create policy "maintenance_staff_all" on maintenance_requests
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "maintenance_tenant_own" on maintenance_requests
  for select using (
    (current_profile()).role = 'tenant'
    and reported_by = auth.uid()
  );

create policy "maintenance_tenant_create" on maintenance_requests
  for insert with check (
    (current_profile()).role = 'tenant'
    and reported_by = auth.uid()
  );

create policy "maintenance_owner_read" on maintenance_requests
  for select using (
    (current_profile()).role = 'owner'
    and property_id in (select id from properties where owner_id = auth.uid())
  );

-- ---------- NOTIFICATIONS ----------
create policy "notifications_own" on notifications
  for all using (profile_id = auth.uid());

-- ---------- BRANDING (lecture publique, écriture admin seul) ----------
create policy "branding_public_read" on branding_settings
  for select using (true);

create policy "branding_admin_write" on branding_settings
  for update using (
    (current_profile()).role = 'admin'
    and organization_id = (current_profile()).organization_id
  );
```

> Note pour Claude Code : répliquer le même pattern (`staff_all` / `owner_read` / `tenant_read`) pour `lease_tenants` et `maintenance_comments`, non détaillé ici par souci de longueur mais strictement identique en logique.

---

## 5. Stockage de fichiers (Supabase Storage)

Trois buckets :

| Bucket | Accès | Contenu | Convention de chemin |
|---|---|---|---|
| `branding` | public | logos, favicons | `{organization_id}/logo.png`, `{organization_id}/favicon.ico` |
| `property-photos` | public (lecture) | photos de biens | `{organization_id}/properties/{property_id}/{filename}` |
| `documents` | privé (RLS + signed URLs) | baux, quittances, pièces d'identité, états des lieux | `{organization_id}/{entity_type}/{entity_id}/{filename}` |

Le bucket `documents` n'est jamais exposé en URL publique : chaque téléchargement passe par `supabase.storage.from('documents').createSignedUrl(path, 60)` généré à la demande, après vérification RLS sur la ligne `documents` correspondante.

---

## 6. Système de theming / marque blanche

### 6.1 Principe
Les couleurs et le nom de marque ne sont **jamais en dur dans le CSS**. Ils vivent dans `branding_settings` et sont injectés en variables CSS au chargement de l'app.

### 6.2 `src/styles/theme.css`
```css
@import "tailwindcss";

@theme {
  --color-primary: var(--brand-primary, #0f172a);
  --color-secondary: var(--brand-secondary, #0067ff);
  --color-accent: var(--brand-accent, #e7f6ff);
  --color-neutral: var(--brand-neutral, #364151);
  --font-sans: var(--brand-font, "Inter"), sans-serif;
}

:root {
  --brand-primary: #0f172a;
  --brand-secondary: #0067ff;
  --brand-accent: #e7f6ff;
  --brand-neutral: #364151;
  --brand-font: "Inter";
}
```

### 6.3 `src/lib/theme.ts`
```ts
import { supabase } from "./supabase";

export async function applyBranding(organizationId: string) {
  const { data, error } = await supabase
    .from("branding_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) return;

  const root = document.documentElement.style;
  root.setProperty("--brand-primary", data.primary_color);
  root.setProperty("--brand-secondary", data.secondary_color);
  root.setProperty("--brand-accent", data.accent_color);
  root.setProperty("--brand-neutral", data.neutral_color);
  root.setProperty("--brand-font", data.font_family);

  document.title = data.display_name;
  if (data.favicon_url) {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (link) link.href = data.favicon_url;
  }
}
```

### 6.4 Palette neutre par défaut (celle de GR AdLab, réutilisable)
| Rôle | Hex | Usage |
|---|---|---|
| Primary | `#0f172a` | textes principaux, sidebar |
| Secondary | `#0067ff` | actions, liens, boutons primaires |
| Accent | `#e7f6ff` | fonds de mise en avant, badges |
| Neutral | `#364151` | textes secondaires, bordures |

C'est une base neutre volontairement peu marquée — chaque agence cliente change ces 4 valeurs depuis son panneau admin sans toucher au code.

### 6.5 Panneau admin `/admin/settings`
Formulaire simple : nom affiché, upload logo (→ bucket `branding`), 4 color pickers, sélecteur de police (liste fermée : Inter, DM Sans, Manrope, Poppins). Sauvegarde → `update branding_settings` → `applyBranding()` rappelé immédiatement pour preview live sans reload.

---

## 7. Arborescence du projet

```
gr-immo-suite/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── netlify.toml
├── .env.example
├── supabase/
│   ├── migrations/
│   │   └── 0001_init.sql          ← contient tout le SQL de la section 3+4
│   └── functions/
│       └── generate-receipt/
│           └── index.ts           ← Edge Function PDF (quittance / avis d'échéance)
├── src/
│   ├── main.ts                    ← bootstrap + router mount
│   ├── router.ts                  ← routeur maison (history API)
│   ├── lib/
│   │   ├── supabase.ts            ← client Supabase
│   │   ├── auth.ts                ← guards de session + rôle
│   │   ├── theme.ts               ← applyBranding()
│   │   └── pdf.ts                 ← appel à l'Edge Function de génération PDF
│   ├── components/
│   │   ├── nav-sidebar.ts
│   │   ├── data-table.ts
│   │   ├── modal.ts
│   │   ├── file-upload.ts
│   │   ├── status-badge.ts
│   │   └── toast.ts
│   ├── pages/
│   │   ├── login.ts
│   │   ├── admin/
│   │   │   ├── dashboard.ts
│   │   │   ├── properties.ts
│   │   │   ├── property-detail.ts
│   │   │   ├── leases.ts
│   │   │   ├── lease-detail.ts
│   │   │   ├── tenants.ts
│   │   │   ├── owners.ts
│   │   │   ├── payments.ts
│   │   │   ├── documents.ts
│   │   │   ├── maintenance.ts
│   │   │   └── settings.ts        ← branding + org params
│   │   ├── owner/
│   │   │   ├── dashboard.ts
│   │   │   ├── properties.ts
│   │   │   ├── documents.ts
│   │   │   └── payments.ts
│   │   └── tenant/
│   │       ├── dashboard.ts
│   │       ├── lease.ts
│   │       ├── payments.ts
│   │       ├── documents.ts
│   │       └── maintenance.ts
│   └── styles/
│       └── theme.css
```

---

## 8. Cartographie des routes

| Route | Rôle | Contenu |
|---|---|---|
| `/login` | tous | auth email/password |
| `/admin` | admin, agent | dashboard : KPIs (impayés, biens vacants, baux expirant sous 60j) |
| `/admin/properties` | admin, agent | liste + création de biens |
| `/admin/properties/:id` | admin, agent | détail bien, historique, documents liés |
| `/admin/leases` | admin, agent | liste baux, statuts |
| `/admin/leases/:id` | admin, agent | détail bail, échéancier, génération quittance |
| `/admin/tenants` | admin, agent | liste locataires |
| `/admin/owners` | admin, agent | liste propriétaires |
| `/admin/payments` | admin, agent | vue globale échéances, relances manuelles (marquer payé) |
| `/admin/documents` | admin, agent | GED centralisée, filtre par entité/catégorie |
| `/admin/maintenance` | admin, agent | tickets d'intervention, changement de statut |
| `/admin/settings` | admin | branding, infos org, devise |
| `/owner` | owner | dashboard : ses biens, revenus, taux d'occupation |
| `/owner/properties/:id` | owner | détail lecture seule |
| `/owner/documents` | owner | ses documents (baux, diagnostics, quittances) |
| `/owner/payments` | owner | historique loyers perçus |
| `/tenant` | tenant | dashboard : bail actif, prochaine échéance |
| `/tenant/lease` | tenant | détail du bail, dates, montants |
| `/tenant/payments` | tenant | historique + téléchargement quittances |
| `/tenant/documents` | tenant | documents partagés (bail signé, état des lieux) |
| `/tenant/maintenance` | tenant | créer/suivre une demande d'intervention |

---

## 9. Explicitement hors scope V1 (et pourquoi)

| Fonctionnalité | Pourquoi exclue de V1 |
|---|---|
| Paiement en ligne (MCB Juice, MIPS, Stripe) | Nécessite intégration bancaire/compliance séparée — le suivi manuel des paiements (marquer "payé") couvre le besoin réel V1 |
| Signature électronique intégrée (type DocuSign) | Le contrat peut être uploadé signé physiquement/via outil externe et hébergé tel quel — l'intégration native est un module V2 |
| Emails/WhatsApp automatiques | Exclu par choix produit — tout reste in-app (notifications + documents), zéro dépendance API tierce de messagerie |
| Multi-langue (EN) | FR uniquement en V1, structure `locale` déjà prévue en DB pour ajouter EN plus tard sans migration |
| App mobile native | Le SPA est responsive, suffisant en V1 |
| Facturation/abonnement SaaS intégré (Stripe Billing) | Tu factures tes clients agences manuellement au début — automatiser la facturation SaaS elle-même est un problème de V2+ |

Ces exclusions ne sont pas des trous du produit — elles gardent le V1 livrable en 5-7 semaines tout en couvrant 100% du besoin quotidien d'une agence : héberger, suivre, partager.

---

## 10. Build & configuration

**.env.example**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

**netlify.toml**
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**package.json (scripts)**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

## 11. Ordre de build recommandé pour Claude Code

1. Scaffold Vite + TS + Tailwind, appliquer `theme.css` avec la palette par défaut (section 6.4)
2. Migration Supabase complète (section 3 + 4) + seed d'une organisation de test + 1 admin
3. Auth + guards de rôle (`lib/auth.ts`) + page `/login`
4. Portail admin : properties → leases → payments → documents → maintenance → settings (branding)
5. Portail owner (lecture seule, réutilise les composants admin en mode restreint)
6. Portail tenant (lecture + création maintenance)
7. Edge Function génération PDF (quittance, avis d'échéance)
8. Polish : dashboard KPIs, notifications in-app, responsive mobile

Chaque étape est testable et démontrable indépendamment — pas besoin d'attendre la fin pour avoir un prototype "exploitable".
