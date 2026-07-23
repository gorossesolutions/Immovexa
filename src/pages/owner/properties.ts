import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Property } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { statusBadge, statusLabel } from "../../components/status-badge";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";
import { PROPERTY_TYPE_LABELS, OWNERSHIP_SCHEME_LABELS } from "../admin/properties";

async function fetchOwnerProperties(): Promise<Property[]> {
  const { data, error } = await supabase.from("properties").select("*").order("reference");
  if (error) {
    showToast("Erreur de chargement de vos biens", "error");
    return [];
  }
  return data as Property[];
}

export async function renderOwnerProperties() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/owner/properties");
  content.innerHTML = `
    <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Mes biens</h1>
    <div id="properties-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#properties-table")!;
  const properties = await fetchOwnerProperties();

  renderDataTable(tableEl, {
    rows: properties,
    emptyMessage: "Aucun bien.",
    onRowClick: (p) => navigate(`/owner/properties/${p.id}`),
    columns: [
      { label: "Référence", render: (p) => `<span class="font-medium">${p.reference}</span>` },
      { label: "Adresse", render: (p) => `${p.address_line}, ${p.city}` },
      { label: "Type", render: (p) => PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type },
      { label: "Régime", render: (p) => (p.ownership_scheme ? OWNERSHIP_SCHEME_LABELS[p.ownership_scheme] ?? p.ownership_scheme : "—") },
      { label: "Statut", render: (p) => statusBadge(p.status) },
    ],
    filters: [{ key: "status", label: "Statut", value: (p) => statusLabel(p.status) }],
  });
}
