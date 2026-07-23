import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Lease } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge } from "../../components/status-badge";
import { renderDetailCard, CARD_CLASSES } from "../../components/detail-table";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";
import {
  LEASE_TYPE_LABELS,
  RENEWAL_TYPE_LABELS,
  confirmDeleteLease,
  fetchPropertyOptions,
  fetchTenantOptions,
  openLeaseModal,
} from "./leases";

interface LeaseTenantRow {
  id: string;
  tenant_id: string;
  is_primary: boolean;
  profiles: { full_name: string } | null;
}

type LeaseDetail = Lease & {
  properties: { id: string; reference: string; city: string } | null;
  lease_tenants: LeaseTenantRow[];
};

async function fetchLease(id: string): Promise<LeaseDetail | null> {
  const { data, error } = await supabase
    .from("leases")
    .select("*, properties(id, reference, city), lease_tenants(id, tenant_id, is_primary, profiles(full_name))")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as unknown as LeaseDetail;
}

export async function renderAdminLeaseDetail(params: Record<string, string>) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin/leases");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const lease = await fetchLease(params.id);
  if (!lease) {
    content.innerHTML = `<p class="text-sm text-red-600">Location introuvable.</p>`;
    return;
  }

  async function draw() {
    const current = await fetchLease(params.id);
    if (!current) {
      content.innerHTML = `<p class="text-sm text-red-600">Location introuvable.</p>`;
      return;
    }

    const allTenants = await fetchTenantOptions();
    const assignedIds = new Set(current.lease_tenants.map((lt) => lt.tenant_id));
    const availableTenants = allTenants.filter((t) => !assignedIds.has(t.id));

    const tenantRows = current.lease_tenants
      .map(
        (lt) => `
        <li class="flex items-center justify-between py-2">
          <span class="text-sm text-slate-900 dark:text-slate-100">${lt.profiles?.full_name ?? "—"} ${lt.is_primary ? '<span class="text-xs text-secondary-fg dark:text-secondary-fg-dark ml-1">(principal)</span>' : ""}</span>
          <button data-remove-tenant="${lt.id}" class="text-xs text-red-600 hover:underline">Retirer</button>
        </li>`
      )
      .join("");

    const availableOptions = availableTenants.map((t) => `<option value="${t.id}">${t.full_name}</option>`).join("");

    content.innerHTML = `
      <a href="/admin/leases" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour aux locations</a>
      <div class="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${current.properties?.reference ?? "—"} — ${current.properties?.city ?? ""}</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400">${current.start_date} → ${current.end_date ?? "indéterminée"}</p>
        </div>
        <div class="flex items-center gap-3">
          ${statusBadge(current.status)}
          <button id="edit-btn" class="rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">Modifier</button>
          <button id="delete-btn" class="rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40">Supprimer</button>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        ${renderDetailCard([
          { label: "Loyer", value: current.rent_amount.toLocaleString("fr-FR") },
          { label: "Charges", value: current.charges_amount.toLocaleString("fr-FR") },
          { label: "Dépôt de garantie", value: current.deposit_amount ? current.deposit_amount.toLocaleString("fr-FR") : "—" },
          { label: "Jour de paiement", value: String(current.payment_day) },
          { label: "Type de location", value: LEASE_TYPE_LABELS[current.lease_type] ?? current.lease_type },
          { label: "Renouvellement", value: RENEWAL_TYPE_LABELS[current.renewal_type] ?? current.renewal_type },
          ...(current.notes ? [{ label: "Notes", value: current.notes, span: true }] : []),
        ])}

        <div class="${CARD_CLASSES} p-6">
          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Locataires</h2>
          <ul class="divide-y divide-slate-200 dark:divide-slate-800">${tenantRows || '<li class="text-sm text-slate-500 dark:text-slate-400 py-2">Aucun locataire assigné.</li>'}</ul>
          ${
            availableTenants.length
              ? `<div class="flex items-center gap-2 mt-4">
                  <select id="add-tenant-select" class="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${availableOptions}</select>
                  <button id="add-tenant-btn" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-3 py-2 hover:opacity-90">Ajouter</button>
                </div>`
              : ""
          }
        </div>
      </div>

      <p class="text-sm text-slate-500 dark:text-slate-400 mt-6">Échéancier de paiements et génération de quittance arrivent aux prochaines étapes.</p>
    `;

    content.querySelector<HTMLButtonElement>("#edit-btn")!.addEventListener("click", async () => {
      const properties = await fetchPropertyOptions();
      const primary = current.lease_tenants.find((lt) => lt.is_primary) ?? current.lease_tenants[0];
      openLeaseModal(properties, allTenants, organizationId, draw, current, primary?.tenant_id);
    });

    content.querySelector<HTMLButtonElement>("#delete-btn")!.addEventListener("click", () => {
      confirmDeleteLease(current, () => {
        showToast("Location supprimée");
        navigate("/admin/leases", { replace: true });
      });
    });

    content.querySelectorAll<HTMLButtonElement>("button[data-remove-tenant]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const { error } = await supabase.from("lease_tenants").delete().eq("id", btn.dataset.removeTenant!);
        if (error) {
          showToast("Erreur lors du retrait", "error");
          return;
        }
        showToast("Locataire retiré");
        draw();
      });
    });

    const addBtn = content.querySelector<HTMLButtonElement>("#add-tenant-btn");
    addBtn?.addEventListener("click", async () => {
      const select = content.querySelector<HTMLSelectElement>("#add-tenant-select")!;
      const tenantId = select.value;
      if (!tenantId) return;
      const { error } = await supabase
        .from("lease_tenants")
        .insert({ lease_id: current.id, tenant_id: tenantId, is_primary: current.lease_tenants.length === 0 });
      if (error) {
        showToast("Erreur lors de l'ajout", "error");
        return;
      }
      showToast("Locataire ajouté");
      draw();
    });
  }

  await draw();
}
