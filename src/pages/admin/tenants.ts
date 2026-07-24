import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { statusBadge, statusLabel } from "../../components/status-badge";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";
import { openImportModal } from "../../components/import-modal";

interface LeaseInfo {
  status: string;
  start_date: string;
  properties: { reference: string; city: string } | null;
}

interface TenantRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  lease?: LeaseInfo;
}

async function fetchTenants(): Promise<TenantRow[]> {
  const [{ data: tenants, error }, { data: leaseTenants }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone").eq("role", "tenant").order("full_name"),
    supabase.from("lease_tenants").select("tenant_id, leases(status, start_date, properties(reference, city))"),
  ]);

  if (error) {
    showToast("Erreur de chargement des locataires", "error");
    return [];
  }

  const leasesByTenant = new Map<string, LeaseInfo[]>();
  for (const lt of (leaseTenants as unknown as { tenant_id: string; leases: LeaseInfo | null }[] | null) ?? []) {
    if (!lt.leases) continue;
    const arr = leasesByTenant.get(lt.tenant_id) ?? [];
    arr.push(lt.leases);
    leasesByTenant.set(lt.tenant_id, arr);
  }

  return (tenants ?? []).map((t) => {
    const leases = leasesByTenant.get(t.id) ?? [];
    const active = leases.find((l) => l.status === "active") ?? [...leases].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
    return { ...t, lease: active };
  });
}

export async function renderAdminTenants() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/admin/tenants");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Locataires</h1>
      <button id="import-tenants" class="rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
        Importer
      </button>
    </div>
    <div id="tenants-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#tenants-table")!;

  async function refresh() {
    const tenants = await fetchTenants();
    renderDataTable(tableEl, {
      rows: tenants,
      emptyMessage: "Aucun locataire.",
      emptyCta: { label: "Importer des locataires", onClick: () => content.querySelector<HTMLButtonElement>("#import-tenants")!.click() },
      onRowClick: (t) => navigate(`/admin/tenants/${t.id}`),
      columns: [
        { label: "Nom", render: (t) => `<span class="font-medium">${t.full_name}</span>` },
        { label: "Contact", render: (t) => `${t.email}${t.phone ? ` · ${t.phone}` : ""}` },
        { label: "Bien", render: (t) => (t.lease ? `${t.lease.properties?.reference ?? "—"} — ${t.lease.properties?.city ?? ""}` : "Aucun bien") },
        { label: "Statut du bail", render: (t) => (t.lease ? statusBadge(t.lease.status) : "—") },
      ],
      filters: [{ key: "status", label: "Statut", value: (t) => (t.lease ? statusLabel(t.lease.status) : "Aucun bien") }],
    });
  }

  content.querySelector<HTMLButtonElement>("#import-tenants")!.addEventListener("click", () => {
    openImportModal("tenant", "locataires", refresh);
  });

  await refresh();
}
