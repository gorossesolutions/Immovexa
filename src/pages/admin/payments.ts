import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Charge, ChargeBalance } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { statusBadge, statusLabel, creditBadge } from "../../components/status-badge";
import { showToast } from "../../components/toast";
import { downloadChargePdf } from "../../lib/pdf";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Virement",
  cash: "Espèces",
  cheque: "Chèque",
  other: "Autre",
};

const CHARGE_CATEGORY_LABELS: Record<string, string> = {
  rent: "Loyer",
  late_fee: "Pénalité de retard",
  deposit: "Dépôt de garantie",
  service_charge: "Charges",
  other: "Autre",
};

interface LeaseOption {
  id: string;
  label: string;
}

interface LeaseContext {
  leaseId: string;
  propertyRef: string;
  city: string;
  tenantName: string;
}

interface ChargeRow extends Charge {
  balance?: ChargeBalance;
  context?: LeaseContext;
  credit?: number;
}

async function fetchCreditByBillingAccount(): Promise<Map<string, number>> {
  const { data } = await supabase.from("billing_account_credit").select("*");
  return new Map((data ?? []).map((c) => [c.billing_account_id, c.available_credit]));
}

async function fetchLeaseOptions(): Promise<LeaseOption[]> {
  const { data, error } = await supabase
    .from("leases")
    .select("id, properties(reference, city), lease_tenants(is_primary, profiles(full_name))")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as any[]).map((l) => {
    const primary = l.lease_tenants.find((lt: any) => lt.is_primary) ?? l.lease_tenants[0];
    const propertyLabel = l.properties ? `${l.properties.reference} — ${l.properties.city}` : "Bien inconnu";
    const tenantLabel = primary?.profiles?.full_name ?? "sans locataire";
    return { id: l.id, label: `${propertyLabel} (${tenantLabel})` };
  });
}

async function fetchLeaseContextByBillingAccount(): Promise<Map<string, LeaseContext>> {
  const { data: accounts, error: accountsError } = await supabase
    .from("billing_accounts")
    .select("id, owner_entity_id")
    .eq("owner_entity_type", "lease");
  if (accountsError || !accounts || accounts.length === 0) return new Map();

  const leaseIds = accounts.map((a) => a.owner_entity_id);
  const { data: leases } = await supabase
    .from("leases")
    .select("id, properties(reference, city), lease_tenants(is_primary, profiles(full_name))")
    .in("id", leaseIds);

  const leaseById = new Map((leases as any[] | null ?? []).map((l) => [l.id, l]));
  const result = new Map<string, LeaseContext>();

  for (const account of accounts) {
    const lease = leaseById.get(account.owner_entity_id);
    if (!lease) continue;
    const primary = lease.lease_tenants.find((lt: any) => lt.is_primary) ?? lease.lease_tenants[0];
    result.set(account.id, {
      leaseId: lease.id,
      propertyRef: lease.properties?.reference ?? "—",
      city: lease.properties?.city ?? "",
      tenantName: primary?.profiles?.full_name ?? "—",
    });
  }
  return result;
}

async function fetchCharges(): Promise<ChargeRow[]> {
  const [{ data: charges, error }, { data: balances }, contextByAccount, creditByAccount] = await Promise.all([
    supabase.from("charges").select("*").order("due_date", { ascending: false }),
    supabase.from("charge_balances").select("*"),
    fetchLeaseContextByBillingAccount(),
    fetchCreditByBillingAccount(),
  ]);

  if (error) {
    showToast("Erreur de chargement des échéances", "error");
    return [];
  }

  const balanceByCharge = new Map((balances as ChargeBalance[] | null ?? []).map((b) => [b.charge_id, b]));

  return (charges as Charge[]).map((c) => ({
    ...c,
    balance: balanceByCharge.get(c.id),
    context: contextByAccount.get(c.billing_account_id),
    credit: creditByAccount.get(c.billing_account_id),
  }));
}

async function getOrCreateBillingAccountForLease(leaseId: string, organizationId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("billing_accounts")
    .select("id")
    .eq("owner_entity_type", "lease")
    .eq("owner_entity_id", leaseId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("billing_accounts")
    .insert({ organization_id: organizationId, owner_entity_type: "lease", owner_entity_id: leaseId, currency: "MUR" })
    .select("id")
    .single();

  if (error || !created) throw new Error(error?.message ?? "Impossible de créer le compte de facturation.");
  return created.id;
}

function chargeFormHtml(leases: LeaseOption[], charge?: ChargeRow) {
  const leaseOptions = leases
    .map((l) => `<option value="${l.id}" ${charge?.context?.leaseId === l.id ? "selected" : ""}>${l.label}</option>`)
    .join("");
  const categoryOptions = Object.entries(CHARGE_CATEGORY_LABELS)
    .map(([v, l]) => `<option value="${v}" ${(charge?.category ?? "rent") === v ? "selected" : ""}>${l}</option>`)
    .join("");
  const statusOptions = ["open", "partially_paid", "paid", "waived"]
    .map((s) => `<option value="${s}" ${charge?.status === s ? "selected" : ""}>${statusLabel(s)}</option>`)
    .join("");

  return `
    <form id="charge-form" class="space-y-4">
      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Location *${charge ? " (non modifiable ici)" : ""}</label>
        ${
          charge
            ? `<p class="text-sm text-slate-900 dark:text-slate-100 py-2">${charge.context ? `${charge.context.propertyRef} — ${charge.context.city} (${charge.context.tenantName})` : "—"}</p>`
            : `<select name="lease_id" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
                <option value="">Sélectionner…</option>${leaseOptions}
              </select>`
        }
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Catégorie *</label>
          <select name="category" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${categoryOptions}</select>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Montant *</label>
          <input name="amount" type="number" step="0.01" required value="${charge?.amount ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Échéance *</label>
          <input name="due_date" type="date" required value="${charge?.due_date ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Début période</label>
          <input name="period_start" type="date" value="${charge?.period_start ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Fin période</label>
          <input name="period_end" type="date" value="${charge?.period_end ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Statut</label>
          <select name="status" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${statusOptions}</select>
        </div>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Description</label>
        <textarea name="description" rows="2"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500">${charge?.description ?? ""}</textarea>
      </div>

      <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
          ${charge ? "Enregistrer" : "Créer l'échéance"}
        </button>
      </div>
    </form>
  `;
}

async function openChargeModal(leases: LeaseOption[], organizationId: string, onSaved: () => void, charge?: ChargeRow) {
  openModal(charge ? "Modifier l'échéance" : "Nouvelle échéance", chargeFormHtml(leases, charge));

  const form = modalBody().querySelector<HTMLFormElement>("#charge-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const fd = new FormData(form);

    const payload = {
      category: String(fd.get("category")),
      amount: Number(fd.get("amount")),
      due_date: String(fd.get("due_date")),
      period_start: String(fd.get("period_start") ?? "").trim() || null,
      period_end: String(fd.get("period_end") ?? "").trim() || null,
      status: String(fd.get("status") ?? "open"),
      description: String(fd.get("description") ?? "").trim() || null,
    };

    try {
      if (charge) {
        const { error } = await supabase.from("charges").update(payload).eq("id", charge.id);
        if (error) throw new Error(error.message);
      } else {
        const leaseId = String(fd.get("lease_id"));
        if (!leaseId) {
          errorEl.textContent = "Sélectionnez une location.";
          errorEl.classList.remove("hidden");
          return;
        }
        const billingAccountId = await getOrCreateBillingAccountForLease(leaseId, organizationId);
        const { error } = await supabase.from("charges").insert({ ...payload, organization_id: organizationId, billing_account_id: billingAccountId });
        if (error) throw new Error(error.message);
      }
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : "Erreur inattendue.";
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast(charge ? "Échéance mise à jour" : "Échéance créée");
    onSaved();
  });
}

async function openMarkPaidModal(charge: ChargeRow, organizationId: string, onSaved: () => void) {
  const today = new Date().toISOString().slice(0, 10);
  const due = charge.balance?.amount_due ?? charge.amount;
  const methodOptions = ["bank_transfer", "cash", "cheque", "other"]
    .map((m) => `<option value="${m}">${PAYMENT_METHOD_LABELS[m]}</option>`)
    .join("");

  openModal(
    "Marquer comme payé",
    `
      <form id="mark-paid-form" class="space-y-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Montant payé</label>
          <input name="amount" type="number" step="0.01" required value="${due}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Un montant supérieur au solde dû reste en crédit et sera automatiquement appliqué aux prochaines échéances de cette location.</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Date de paiement</label>
            <input name="payment_date" type="date" required value="${today}" max="${today}"
              class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Méthode</label>
            <select name="payment_method" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${methodOptions}</select>
          </div>
        </div>
        <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
          <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">Confirmer</button>
        </div>
      </form>
    `
  );

  const form = modalBody().querySelector<HTMLFormElement>("#mark-paid-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const fd = new FormData(form);
    const amount = Number(fd.get("amount"));
    const paymentDate = String(fd.get("payment_date"));

    if (paymentDate > today) {
      errorEl.textContent = "La date de paiement ne peut pas être dans le futur.";
      errorEl.classList.remove("hidden");
      return;
    }

    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        organization_id: organizationId,
        billing_account_id: charge.billing_account_id,
        amount,
        payment_date: paymentDate,
        payment_method: String(fd.get("payment_method")),
      })
      .select("id")
      .single();

    if (error || !payment) {
      errorEl.textContent = error?.message ?? "Erreur lors de l'enregistrement.";
      errorEl.classList.remove("hidden");
      return;
    }

    const { error: allocError } = await supabase.rpc("allocate_payment", { p_payment_id: payment.id });
    if (allocError) {
      errorEl.textContent = allocError.message;
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast("Paiement enregistré");
    onSaved();
  });
}

async function confirmDeleteCharge(charge: ChargeRow, onDeleted: () => void) {
  openModal(
    "Supprimer l'échéance",
    `
      <p class="text-sm text-slate-500 dark:text-slate-400">Supprimer cette échéance retirera aussi les allocations de paiement associées. Cette action est irréversible.</p>
      <div class="flex justify-end gap-3 pt-6">
        <button id="cancel-delete" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button id="confirm-delete" class="rounded-md bg-danger text-white text-sm font-medium px-4 py-2 hover:opacity-90">Supprimer</button>
      </div>
    `
  );

  modalBody().querySelector<HTMLButtonElement>("#cancel-delete")!.addEventListener("click", closeModal);
  modalBody().querySelector<HTMLButtonElement>("#confirm-delete")!.addEventListener("click", async () => {
    const { error } = await supabase.from("charges").delete().eq("id", charge.id);
    closeModal();
    if (error) {
      showToast("Erreur lors de la suppression", "error");
      return;
    }
    showToast("Échéance supprimée");
    onDeleted();
  });
}

export async function renderAdminPayments() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin/payments");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Paiements</h1>
      <button id="new-charge" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
        Nouvelle échéance
      </button>
    </div>
    <div id="credit-banner"></div>
    <div id="charges-table"></div>
  `;

  const bannerEl = content.querySelector<HTMLDivElement>("#credit-banner")!;
  const tableEl = content.querySelector<HTMLDivElement>("#charges-table")!;

  async function refreshCreditBanner() {
    const [creditByAccount, contextByAccount] = await Promise.all([fetchCreditByBillingAccount(), fetchLeaseContextByBillingAccount()]);
    const creditedAccounts = [...creditByAccount.entries()].filter(([, amount]) => amount > 0);

    if (creditedAccounts.length === 0) {
      bannerEl.innerHTML = "";
      return;
    }

    const total = creditedAccounts.reduce((sum, [, amount]) => sum + amount, 0);
    const tenantNames = creditedAccounts.map(([accountId]) => contextByAccount.get(accountId)?.tenantName ?? "—");
    const count = tenantNames.length;

    bannerEl.innerHTML = `
      <div class="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-sm px-4 py-3 mb-4">
        💰 ${count} locataire${count > 1 ? "s" : ""} ${count > 1 ? "ont" : "a"} un solde créditeur non affecté — total ${total.toLocaleString("fr-FR")} MUR
      </div>
    `;
  }

  async function refresh() {
    await refreshCreditBanner();
    const [charges, leases] = await Promise.all([fetchCharges(), fetchLeaseOptions()]);
    renderDataTable(tableEl, {
      rows: charges,
      emptyMessage: "Aucune échéance enregistrée.",
      columns: [
        { label: "Bien", render: (c) => (c.context ? `${c.context.propertyRef} — ${c.context.city}` : "—") },
        {
          label: "Locataire",
          render: (c) => `${c.context?.tenantName ?? "—"}${c.credit && c.credit > 0 ? creditBadge(c.credit) : ""}`,
        },
        { label: "Catégorie", render: (c) => CHARGE_CATEGORY_LABELS[c.category] ?? c.category },
        { label: "Échéance", render: (c) => c.due_date },
        { label: "Montant dû", render: (c) => c.amount.toLocaleString("fr-FR") },
        { label: "Payé", render: (c) => (c.balance?.amount_paid ?? 0).toLocaleString("fr-FR") },
        { label: "Reste dû", render: (c) => (c.balance?.amount_due ?? c.amount).toLocaleString("fr-FR") },
        { label: "Statut", render: (c) => statusBadge(c.status) },
      ],
      filters: [
        { key: "status", label: "Statut", value: (c) => statusLabel(c.status) },
        { key: "category", label: "Catégorie", value: (c) => CHARGE_CATEGORY_LABELS[c.category] ?? c.category },
      ],
      actions: [
        {
          label: "Marquer payé",
          onClick: (c) => openMarkPaidModal(c, organizationId, refresh),
        },
        {
          label: "Quittance",
          variant: "solid",
          show: (c) => c.status === "paid",
          onClick: (c) => downloadChargePdf(c.id, "receipt", `quittance-${c.id}.pdf`),
        },
        {
          label: "Avis d'échéance",
          variant: "solid",
          show: (c) => c.status === "open" || c.status === "partially_paid",
          onClick: (c) => downloadChargePdf(c.id, "notice", `avis-echeance-${c.id}.pdf`),
        },
        {
          label: "Modifier",
          onClick: (c) => openChargeModal(leases, organizationId, refresh, c),
        },
        {
          label: "Supprimer",
          variant: "danger",
          onClick: (c) => confirmDeleteCharge(c, refresh),
        },
      ],
    });
  }

  content.querySelector<HTMLButtonElement>("#new-charge")!.addEventListener("click", async () => {
    const leases = await fetchLeaseOptions();
    openChargeModal(leases, organizationId, refresh);
  });

  await refresh();
}
