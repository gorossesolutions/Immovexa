import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";

interface OwnerRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  propertyCount: number;
}

async function fetchOwnersWithCount(): Promise<OwnerRow[]> {
  const [{ data: owners, error }, { data: properties }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone").eq("role", "owner").order("full_name"),
    supabase.from("properties").select("id, owner_id"),
  ]);

  if (error) {
    showToast("Erreur de chargement des propriétaires", "error");
    return [];
  }

  const countByOwner = new Map<string, number>();
  for (const p of properties ?? []) {
    countByOwner.set(p.owner_id, (countByOwner.get(p.owner_id) ?? 0) + 1);
  }

  return (owners ?? []).map((o) => ({ ...o, propertyCount: countByOwner.get(o.id) ?? 0 }));
}

export async function renderAdminOwners() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/admin/owners");
  content.innerHTML = `
    <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Propriétaires</h1>
    <div id="owners-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#owners-table")!;
  const owners = await fetchOwnersWithCount();

  renderDataTable(tableEl, {
    rows: owners,
    emptyMessage: "Aucun propriétaire.",
    onRowClick: (o) => navigate(`/admin/owners/${o.id}`),
    columns: [
      { label: "Nom", render: (o) => `<span class="font-medium">${o.full_name}</span>` },
      { label: "Contact", render: (o) => `${o.email}${o.phone ? ` · ${o.phone}` : ""}` },
      { label: "Nombre de biens", render: (o) => `<span class="tabular-nums">${o.propertyCount}</span>` },
    ],
  });
}
