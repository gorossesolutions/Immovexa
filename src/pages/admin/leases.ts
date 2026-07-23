import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Lease, TenantOption } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { statusBadge, statusLabel } from "../../components/status-badge";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";

export const LEASE_TYPE_LABELS: Record<string, string> = {
  residential: "Résidentiel",
  commercial: "Commercial",
  seasonal: "Saisonnier",
};

export const RENEWAL_TYPE_LABELS: Record<string, string> = {
  fixed: "Durée fixe",
  tacit_renewal: "Tacite reconduction",
};

interface PropertyOption {
  id: string;
  reference: string;
  city: string;
}

type LeaseRow = Lease & {
  properties: { reference: string; city: string } | null;
  lease_tenants: { tenant_id: string; is_primary: boolean; profiles: { full_name: string } | null }[];
};

async function fetchLeases(): Promise<LeaseRow[]> {
  const { data, error } = await supabase
    .from("leases")
    .select("*, properties(reference, city), lease_tenants(tenant_id, is_primary, profiles(full_name))")
    .order("created_at", { ascending: false });
  if (error) {
    showToast("Erreur de chargement des baux", "error");
    return [];
  }
  return data as unknown as LeaseRow[];
}

export async function fetchPropertyOptions(): Promise<PropertyOption[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("id, reference, city")
    .order("reference");
  if (error) return [];
  return data as PropertyOption[];
}

export async function fetchTenantOptions(): Promise<TenantOption[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "tenant")
    .order("full_name");
  if (error) return [];
  return data as TenantOption[];
}

function primaryTenantName(row: LeaseRow): string {
  const primary = row.lease_tenants.find((lt) => lt.is_primary) ?? row.lease_tenants[0];
  return primary?.profiles?.full_name ?? "—";
}

function leaseFormHtml(properties: PropertyOption[], tenants: TenantOption[], lease?: Lease, currentTenantId?: string) {
  const propertyOptions = properties
    .map((p) => `<option value="${p.id}" ${lease?.property_id === p.id ? "selected" : ""}>${p.reference} — ${p.city}</option>`)
    .join("");
  const tenantOptions = tenants
    .map((t) => `<option value="${t.id}" ${currentTenantId === t.id ? "selected" : ""}>${t.full_name}</option>`)
    .join("");
  const statusOptions = ["draft", "active", "ended", "terminated"]
    .map((s) => `<option value="${s}" ${lease?.status === s ? "selected" : ""}>${statusLabel(s)}</option>`)
    .join("");
  const leaseTypeOptions = Object.entries(LEASE_TYPE_LABELS)
    .map(([v, l]) => `<option value="${v}" ${lease?.lease_type === v ? "selected" : ""}>${l}</option>`)
    .join("");
  const renewalTypeOptions = Object.entries(RENEWAL_TYPE_LABELS)
    .map(([v, l]) => `<option value="${v}" ${lease?.renewal_type === v ? "selected" : ""}>${l}</option>`)
    .join("");

  return `
    <form id="lease-form" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Bien *</label>
          <select name="property_id" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
            <option value="">Sélectionner…</option>${propertyOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Locataire principal *${lease ? " (non modifiable ici)" : ""}</label>
          ${
            lease
              ? `<p class="text-sm text-slate-900 dark:text-slate-100 py-2">${tenants.find((t) => t.id === currentTenantId)?.full_name ?? "—"}</p>`
              : `<select name="tenant_id" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
                  <option value="">Sélectionner…</option>${tenantOptions}
                </select>`
          }
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Date de début *</label>
          <input name="start_date" type="date" required value="${lease?.start_date ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Date de fin</label>
          <input name="end_date" type="date" value="${lease?.end_date ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Loyer *</label>
          <input name="rent_amount" type="number" step="0.01" required value="${lease?.rent_amount ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Charges</label>
          <input name="charges_amount" type="number" step="0.01" value="${lease?.charges_amount ?? 0}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Dépôt de garantie</label>
          <input name="deposit_amount" type="number" step="0.01" value="${lease?.deposit_amount ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Jour de paiement (1-28) *</label>
          <input name="payment_day" type="number" min="1" max="28" required value="${lease?.payment_day ?? 1}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Statut</label>
          <select name="status" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${statusOptions}</select>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Type de location</label>
          <select name="lease_type" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${leaseTypeOptions}</select>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Renouvellement</label>
          <select name="renewal_type" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${renewalTypeOptions}</select>
        </div>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Notes</label>
        <textarea name="notes" rows="3" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${lease?.notes ?? ""}</textarea>
      </div>

      <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
          ${lease ? "Enregistrer" : "Créer la location"}
        </button>
      </div>
    </form>
  `;
}

function readLeasePayload(form: HTMLFormElement) {
  const fd = new FormData(form);
  const num = (key: string) => {
    const v = fd.get(key);
    return v && String(v).trim() !== "" ? Number(v) : null;
  };
  return {
    property_id: String(fd.get("property_id")),
    start_date: String(fd.get("start_date")),
    end_date: String(fd.get("end_date") ?? "").trim() || null,
    rent_amount: num("rent_amount"),
    charges_amount: num("charges_amount") ?? 0,
    deposit_amount: num("deposit_amount"),
    payment_day: num("payment_day") ?? 1,
    status: String(fd.get("status")),
    lease_type: String(fd.get("lease_type")),
    renewal_type: String(fd.get("renewal_type")),
    notes: String(fd.get("notes") ?? "").trim() || null,
  };
}

export async function openLeaseModal(
  properties: PropertyOption[],
  tenants: TenantOption[],
  organizationId: string,
  onSaved: () => void,
  lease?: Lease,
  currentTenantId?: string
) {
  openModal(lease ? "Modifier la location" : "Nouvelle location", leaseFormHtml(properties, tenants, lease, currentTenantId));

  const form = modalBody().querySelector<HTMLFormElement>("#lease-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const payload = readLeasePayload(form);

    if (!payload.property_id) {
      errorEl.textContent = "Sélectionnez un bien.";
      errorEl.classList.remove("hidden");
      return;
    }

    if (lease) {
      const { error } = await supabase.from("leases").update(payload).eq("id", lease.id);
      if (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove("hidden");
        return;
      }
    } else {
      const fd = new FormData(form);
      const tenantId = String(fd.get("tenant_id") ?? "");
      if (!tenantId) {
        errorEl.textContent = "Sélectionnez un locataire.";
        errorEl.classList.remove("hidden");
        return;
      }

      const { data: newLease, error } = await supabase
        .from("leases")
        .insert({ ...payload, organization_id: organizationId })
        .select()
        .single();

      if (error || !newLease) {
        errorEl.textContent = error?.message ?? "Erreur lors de la création.";
        errorEl.classList.remove("hidden");
        return;
      }

      const { error: ltError } = await supabase
        .from("lease_tenants")
        .insert({ lease_id: newLease.id, tenant_id: tenantId, is_primary: true });

      if (ltError) {
        errorEl.textContent = ltError.message;
        errorEl.classList.remove("hidden");
        return;
      }
    }

    closeModal();
    showToast(lease ? "Location mise à jour" : "Location créée");
    onSaved();
  });
}

export async function confirmDeleteLease(lease: Lease, onDeleted: () => void) {
  openModal(
    "Supprimer la location",
    `
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Supprimer cette location supprimera aussi son échéancier de paiements. Cette action est irréversible.
      </p>
      <div class="flex justify-end gap-3 pt-6">
        <button id="cancel-delete" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button id="confirm-delete" class="rounded-md bg-danger text-white text-sm font-medium px-4 py-2 hover:opacity-90">Supprimer</button>
      </div>
    `
  );

  modalBody().querySelector<HTMLButtonElement>("#cancel-delete")!.addEventListener("click", closeModal);
  modalBody().querySelector<HTMLButtonElement>("#confirm-delete")!.addEventListener("click", async () => {
    const { error } = await supabase.from("leases").delete().eq("id", lease.id);
    closeModal();
    if (error) {
      showToast("Erreur lors de la suppression", "error");
      return;
    }
    showToast("Location supprimée");
    onDeleted();
  });
}

export async function renderAdminLeases() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin/leases");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Location</h1>
      <button id="new-lease" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
        Nouvelle location
      </button>
    </div>
    <div id="leases-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#leases-table")!;

  async function refresh() {
    const [leases, properties, tenants] = await Promise.all([fetchLeases(), fetchPropertyOptions(), fetchTenantOptions()]);
    renderDataTable(tableEl, {
      rows: leases,
      emptyMessage: "Aucune location enregistrée.",
      onRowClick: (l) => navigate(`/admin/leases/${l.id}`),
      columns: [
        { label: "Bien", render: (l) => (l.properties ? `${l.properties.reference} — ${l.properties.city}` : "—") },
        { label: "Locataire", render: (l) => primaryTenantName(l) },
        { label: "Période", render: (l) => `${l.start_date} → ${l.end_date ?? "indéterminée"}` },
        { label: "Loyer", render: (l) => `${(l.rent_amount + l.charges_amount).toLocaleString("fr-FR")}` },
        { label: "Statut", render: (l) => statusBadge(l.status) },
      ],
      filters: [{ key: "status", label: "Statut", value: (l) => statusLabel(l.status) }],
      actions: [
        {
          label: "Modifier",
          onClick: (l) => {
            const primary = l.lease_tenants.find((lt) => lt.is_primary) ?? l.lease_tenants[0];
            openLeaseModal(properties, tenants, organizationId, refresh, l, primary?.tenant_id);
          },
        },
        {
          label: "Supprimer",
          variant: "danger",
          onClick: (l) => confirmDeleteLease(l, refresh),
        },
      ],
    });
  }

  content.querySelector<HTMLButtonElement>("#new-lease")!.addEventListener("click", async () => {
    const [properties, tenants] = await Promise.all([fetchPropertyOptions(), fetchTenantOptions()]);
    openLeaseModal(properties, tenants, organizationId, refresh);
  });

  await refresh();
}
