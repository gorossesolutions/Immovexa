import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Property } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { statusBadge } from "../../components/status-badge";
import { COMMERCIAL_STATUS_LABELS } from "../../lib/status-labels";
import { navigate } from "../../router";
import { PROPERTY_TYPE_LABELS, fetchCommercialStatuses } from "./properties";

interface OwnerProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

async function fetchOwner(id: string): Promise<OwnerProfile | null> {
  const { data } = await supabase.from("profiles").select("id, full_name, email, phone").eq("id", id).eq("role", "owner").single();
  return data as OwnerProfile | null;
}

async function fetchOwnerProperties(ownerId: string): Promise<Property[]> {
  const { data } = await supabase
    .from("property_owners")
    .select("properties(*)")
    .eq("owner_id", ownerId);
  return ((data as any[] | null) ?? [])
    .map((row) => row.properties as Property)
    .filter(Boolean)
    .sort((a, b) => a.reference.localeCompare(b.reference));
}

export async function renderAdminOwnerDetail(params: Record<string, string>) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/admin/owners");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const owner = await fetchOwner(params.id);
  if (!owner) {
    content.innerHTML = `<p class="text-sm text-red-600">Propriétaire introuvable.</p>`;
    return;
  }

  const [properties, commercialStatuses] = await Promise.all([fetchOwnerProperties(owner.id), fetchCommercialStatuses()]);

  content.innerHTML = `
    <a href="/admin/owners" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour aux propriétaires</a>
    <div class="mt-3 mb-6">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${owner.full_name}</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">${owner.email}${owner.phone ? ` · ${owner.phone}` : ""}</p>
    </div>
    <div id="owner-properties-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#owner-properties-table")!;

  renderDataTable(tableEl, {
    rows: properties,
    emptyMessage: "Aucun bien.",
    onRowClick: (p) => navigate(`/admin/properties/${p.id}`),
    columns: [
      { label: "Référence", render: (p) => `<span class="font-medium">${p.reference}</span>` },
      { label: "Adresse", render: (p) => `${p.address_line}, ${p.city}` },
      { label: "Type", render: (p) => PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type },
      { label: "Statut", render: (p) => statusBadge(p.status) },
      {
        label: "Statut commercial",
        render: (p) => {
          const cs = commercialStatuses.get(p.id) ?? "no_active_listing";
          return statusBadge(cs, COMMERCIAL_STATUS_LABELS[cs] ?? cs);
        },
      },
    ],
  });
}
