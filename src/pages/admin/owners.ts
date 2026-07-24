import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";
import { openImportModal } from "../../components/import-modal";

interface OwnerRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  propertyCount: number;
}

async function fetchOwnersWithCount(): Promise<OwnerRow[]> {
  const [{ data: owners, error }, { data: propertyOwners }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone").eq("role", "owner").order("full_name"),
    supabase.from("property_owners").select("owner_id, property_id"),
  ]);

  if (error) {
    showToast("Erreur de chargement des propriétaires", "error");
    return [];
  }

  const propertiesByOwner = new Map<string, Set<string>>();
  for (const po of propertyOwners ?? []) {
    const set = propertiesByOwner.get(po.owner_id) ?? new Set<string>();
    set.add(po.property_id);
    propertiesByOwner.set(po.owner_id, set);
  }

  return (owners ?? []).map((o) => ({ ...o, propertyCount: propertiesByOwner.get(o.id)?.size ?? 0 }));
}

export async function renderAdminOwners() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/admin/owners");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Propriétaires</h1>
      <button id="import-owners" class="rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
        Importer
      </button>
    </div>
    <div id="owners-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#owners-table")!;

  async function refresh() {
    const owners = await fetchOwnersWithCount();
    renderDataTable(tableEl, {
      rows: owners,
      emptyMessage: "Aucun propriétaire.",
      emptyCta: { label: "Importer des propriétaires", onClick: () => content.querySelector<HTMLButtonElement>("#import-owners")!.click() },
      onRowClick: (o) => navigate(`/admin/owners/${o.id}`),
      columns: [
        { label: "Nom", render: (o) => `<span class="font-medium">${o.full_name}</span>` },
        { label: "Contact", render: (o) => `${o.email}${o.phone ? ` · ${o.phone}` : ""}` },
        { label: "Nombre de biens", render: (o) => `<span class="tabular-nums">${o.propertyCount}</span>` },
      ],
    });
  }

  content.querySelector<HTMLButtonElement>("#import-owners")!.addEventListener("click", () => {
    openImportModal("owner", "propriétaires", refresh);
  });

  await refresh();
}
