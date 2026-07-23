import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Property } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge } from "../../components/status-badge";
import { renderDetailCard } from "../../components/detail-table";
import { PROPERTY_TYPE_LABELS, OWNERSHIP_SCHEME_LABELS } from "../admin/properties";

async function fetchProperty(id: string): Promise<Property | null> {
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data as Property;
}

export async function renderOwnerPropertyDetail(params: Record<string, string>) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/owner/properties");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const p = await fetchProperty(params.id);
  if (!p) {
    content.innerHTML = `<p class="text-sm text-red-600">Bien introuvable.</p>`;
    return;
  }

  content.innerHTML = `
    <a href="/owner/properties" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour à mes biens</a>
    <div class="flex items-start justify-between mt-3 mb-6">
      <div>
        <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${p.reference}</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">${p.address_line}, ${p.city}${p.region ? ", " + p.region : ""}</p>
      </div>
      ${statusBadge(p.status)}
    </div>

    ${renderDetailCard(
      [
        { label: "Type", value: PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type },
        { label: "Régime de propriété", value: p.ownership_scheme ? OWNERSHIP_SCHEME_LABELS[p.ownership_scheme] ?? p.ownership_scheme : "—" },
        { label: "Devise", value: p.currency },
        { label: "Surface", value: p.surface_area ? `${p.surface_area} m²` : "—" },
        { label: "Meublé", value: p.furnished ? "Oui" : "Non" },
        { label: "Pièces", value: String(p.rooms ?? "—") },
        { label: "Chambres", value: String(p.bedrooms ?? "—") },
        { label: "Salles de bain", value: String(p.bathrooms ?? "—") },
        ...(p.description ? [{ label: "Description", value: p.description, span: true }] : []),
      ],
      3
    )}
  `;
}
