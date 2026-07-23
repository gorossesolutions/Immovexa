-- ============================================================
-- MOTEUR DE FACTURATION GÉNÉRIQUE (module `billing`, section 2 du
-- complément v1.1)
--
-- Règle d'isolation sectorielle (section 0) : rien ici ne référence
-- "lease", "tenant" ou "rent" dans la LOGIQUE. Le mot "rent" apparaît
-- uniquement comme valeur de données possible dans le check constraint
-- de `charges.category` (au même titre que 'late_fee', 'deposit'...) —
-- ça reste une catégorie libre choisie par le module appelant, pas une
-- branche de code spécifique à l'immobilier.
-- ============================================================

-- L'ancienne table `payments` (liée directement à lease_id, section 3
-- de SPEC.md) est remplacée par le ledger générique ci-dessous.
drop table if exists payments cascade;

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
-- (le job quotidien qui les applique n'est pas construit dans cette
-- étape — non demandé, cf. section 2.4 dernier paragraphe)
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

-- ============================================================
-- VUES CALCULÉES (jamais de champ stocké à désynchroniser)
-- ============================================================

-- security_invoker = true est indispensable ici : sans lui, une vue créée
-- par postgres (superuser, bypass RLS) s'exécute avec SES privilèges et
-- non ceux du rôle qui interroge la vue, donc elle ignore silencieusement
-- la RLS des tables sous-jacentes et fuit toutes les lignes à tout le
-- monde. Vérifié empiriquement avant ce correctif : un owner sans aucune
-- policy sur `charges` voyait les 6 charges de tous les baux via cette vue.
create view charge_balances with (security_invoker = true) as
select
  c.id as charge_id,
  c.amount,
  coalesce(sum(pa.amount_allocated), 0) as amount_paid,
  c.amount - coalesce(sum(pa.amount_allocated), 0) as amount_due
from charges c
left join payment_allocations pa on pa.charge_id = c.id
group by c.id, c.amount;

create view payment_unallocated with (security_invoker = true) as
select
  p.id as payment_id,
  p.billing_account_id,
  p.amount,
  coalesce(sum(pa.amount_allocated), 0) as amount_allocated,
  p.amount - coalesce(sum(pa.amount_allocated), 0) as amount_unallocated
from payments p
left join payment_allocations pa on pa.payment_id = p.id
group by p.id, p.billing_account_id, p.amount;

create view billing_account_credit with (security_invoker = true) as
select billing_account_id, sum(amount_unallocated) as available_credit
from payment_unallocated
where amount_unallocated > 0
group by billing_account_id;

-- ============================================================
-- ALGORITHME D'ALLOCATION — fonctions Postgres génériques
-- ============================================================

-- Appelée à l'enregistrement d'un paiement.
create or replace function allocate_payment(p_payment_id uuid)
returns void
language plpgsql
as $$
declare
  v_billing_account_id uuid;
  v_remaining numeric;
  v_charge_due numeric;
  v_alloc numeric;
  r record;
begin
  select billing_account_id, amount into v_billing_account_id, v_remaining
  from payments
  where id = p_payment_id;

  if v_billing_account_id is null then
    return;
  end if;

  for r in
    select id, amount
    from charges
    where billing_account_id = v_billing_account_id
      and status in ('open', 'partially_paid')
    order by due_date asc
  loop
    exit when v_remaining <= 0;

    select r.amount - coalesce(sum(amount_allocated), 0) into v_charge_due
    from payment_allocations
    where charge_id = r.id;

    if v_charge_due <= 0 then
      continue;
    end if;

    v_alloc := least(v_remaining, v_charge_due);

    insert into payment_allocations (payment_id, charge_id, amount_allocated)
    values (p_payment_id, r.id, v_alloc);

    v_remaining := v_remaining - v_alloc;

    update charges
    set status = case when v_charge_due - v_alloc <= 0 then 'paid' else 'partially_paid' end
    where id = r.id;
  end loop;
end;
$$;

-- Appelée juste après l'insertion d'une nouvelle charge (typiquement
-- issue d'un charge_schedule) pour absorber un éventuel trop-perçu.
create or replace function apply_credit_to_charge(p_charge_id uuid)
returns void
language plpgsql
as $$
declare
  v_billing_account_id uuid;
  v_charge_amount numeric;
  v_remaining_charge numeric;
  v_alloc numeric;
  v_any_allocated boolean := false;
  r record;
begin
  select billing_account_id, amount into v_billing_account_id, v_charge_amount
  from charges
  where id = p_charge_id;

  if v_billing_account_id is null then
    return;
  end if;

  select v_charge_amount - coalesce(sum(amount_allocated), 0) into v_remaining_charge
  from payment_allocations
  where charge_id = p_charge_id;

  if v_remaining_charge <= 0 then
    return;
  end if;

  for r in
    select id, amount
    from payments
    where billing_account_id = v_billing_account_id
    order by payment_date asc
  loop
    exit when v_remaining_charge <= 0;

    select r.amount - coalesce(sum(amount_allocated), 0) into v_alloc
    from payment_allocations
    where payment_id = r.id;

    if v_alloc <= 0 then
      continue;
    end if;

    v_alloc := least(v_remaining_charge, v_alloc);

    insert into payment_allocations (payment_id, charge_id, amount_allocated)
    values (r.id, p_charge_id, v_alloc);

    v_remaining_charge := v_remaining_charge - v_alloc;
    v_any_allocated := true;
  end loop;

  -- Ne touche au statut que si du crédit a réellement été appliqué : sinon
  -- une charge encore 'open' sans aucun crédit disponible se retrouvait
  -- forcée à 'partially_paid' avec 0 payé, ce qui est faux.
  if v_any_allocated then
    update charges
    set status = case when v_remaining_charge <= 0 then 'paid' else 'partially_paid' end
    where id = p_charge_id;
  end if;
end;
$$;

-- ============================================================
-- RLS — staff uniquement (scope générique par organization_id, zéro
-- référence immobilière). L'accès owner/tenant est ajouté dans la
-- migration suivante (0008), qui isole explicitement le pont vers le
-- vocabulaire immobilier hors de ce fichier — cf. son en-tête.
-- ============================================================

alter table billing_accounts enable row level security;
alter table charge_schedules enable row level security;
alter table charges enable row level security;
alter table payments enable row level security;
alter table payment_allocations enable row level security;
alter table late_fee_rules enable row level security;

create policy "billing_accounts_staff_all" on billing_accounts
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "charge_schedules_staff_all" on charge_schedules
  for all using (
    (current_profile()).role in ('admin','agent')
    and billing_account_id in (
      select id from billing_accounts where organization_id = (current_profile()).organization_id
    )
  );

create policy "charges_staff_all" on charges
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "payments_staff_all" on payments
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

create policy "payment_allocations_staff_all" on payment_allocations
  for all using (
    (current_profile()).role in ('admin','agent')
    and payment_id in (
      select id from payments where organization_id = (current_profile()).organization_id
    )
  );

create policy "late_fee_rules_staff_all" on late_fee_rules
  for all using (
    (current_profile()).role in ('admin','agent')
    and organization_id = (current_profile()).organization_id
  );

grant select, insert, update, delete on
  billing_accounts, charge_schedules, charges, payments, payment_allocations, late_fee_rules
to authenticated;

grant select on charge_balances, payment_unallocated, billing_account_credit to authenticated;

grant execute on function allocate_payment(uuid) to authenticated;
grant execute on function apply_credit_to_charge(uuid) to authenticated;
