import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Property } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge } from "../../components/status-badge";
import { renderDetailCard } from "../../components/detail-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";
import { COMMERCIAL_STATUS_LABELS } from "../../lib/status-labels";
import {
  OWNERSHIP_SCHEME_LABELS,
  PROPERTY_TYPE_LABELS,
  UNIT_SCOPE_LABELS,
  confirmDeleteProperty,
  fetchOwners,
  openPropertyModal,
} from "./properties";

async function fetchProperty(id: string): Promise<(Property & { owner_name: string | null }) | null> {
  const { data, error } = await supabase
    .from("properties")
    .select("*, profiles:owner_id (full_name)")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  const { profiles, ...property } = data as Property & { profiles: { full_name: string } | null };
  return { ...property, owner_name: profiles?.full_name ?? null };
}

async function fetchCommercialStatus(propertyId: string): Promise<string> {
  const { data } = await supabase
    .from("property_commercial_status")
    .select("commercial_status")
    .eq("property_id", propertyId)
    .single();
  return data?.commercial_status ?? "no_active_listing";
}

function openReactivateModal(property: Property, organizationId: string, onDone: () => void) {
  openModal(
    "Réactiver ce bien à la vente",
    `
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Une nouvelle annonce de vente active sera créée pour <strong>${property.reference}</strong>.
        La vente précédente ne sera pas supprimée, elle reste dans l'historique du bien.
      </p>
      <form id="reactivate-form" class="space-y-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Prix de vente</label>
          <input name="price" type="number" step="0.01" placeholder="Nouveau prix demandé"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
        </div>
        <p id="reactivate-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" id="cancel-reactivate" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
          <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">Réactiver</button>
        </div>
      </form>
    `
  );

  const form = modalBody().querySelector<HTMLFormElement>("#reactivate-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#reactivate-error")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-reactivate")!.addEventListener("click", closeModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const fd = new FormData(form);
    const priceRaw = String(fd.get("price") ?? "").trim();

    const { error } = await supabase.rpc("reactivate_property_listing", {
      p_organization_id: organizationId,
      p_property_id: property.id,
      p_listing_type: "sale",
      p_price: priceRaw ? Number(priceRaw) : null,
      p_monthly_rent: null,
      p_nightly_rate: null,
      p_currency: property.currency,
      p_commission_rate: null,
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast("Bien réactivé à la vente");
    onDone();
  });
}

export async function renderAdminPropertyDetail(params: Record<string, string>) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin/properties");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const property = await fetchProperty(params.id);
  if (!property) {
    content.innerHTML = `<p class="text-sm text-red-600">Bien introuvable.</p>`;
    return;
  }

  async function refresh() {
    const refreshedProperty = await fetchProperty(params.id);
    const refreshedStatus = await fetchCommercialStatus(params.id);
    draw(refreshedProperty, refreshedStatus);
  }

  function draw(p: typeof property, commercialStatus: string) {
    if (!p) return;
    const underOfferBanner =
      commercialStatus === "under_offer"
        ? `<div class="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm px-4 py-3 mb-6">
             Ce bien est actuellement sous offre — une vente est en cours de finalisation.
           </div>`
        : "";
    content.innerHTML = `
      <a href="/admin/properties" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour aux biens</a>
      <div class="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${p.reference}</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400">${p.address_line}, ${p.city}${p.region ? ", " + p.region : ""}</p>
        </div>
        <div class="flex items-center gap-3">
          ${statusBadge(p.status)}
          ${statusBadge(commercialStatus, COMMERCIAL_STATUS_LABELS[commercialStatus] ?? commercialStatus)}
          ${
            commercialStatus === "sold"
              ? `<button id="reactivate-btn" class="rounded-md border border-secondary text-secondary-fg dark:text-secondary-fg-dark text-sm px-3 py-1.5 hover:bg-secondary/10">Réactiver ce bien à la vente</button>`
              : ""
          }
          <button id="edit-btn" class="rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">Modifier</button>
          <button id="delete-btn" class="rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40">Supprimer</button>
        </div>
      </div>

      ${underOfferBanner}

      ${renderDetailCard(
        [
          { label: "Type", value: PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type },
          { label: "Propriétaire", value: p.owner_name ?? "—" },
          { label: "Régime de propriété", value: p.ownership_scheme ? OWNERSHIP_SCHEME_LABELS[p.ownership_scheme] ?? p.ownership_scheme : "—" },
          { label: "Étage", value: p.floor_level ?? "—" },
          { label: "N° unité", value: p.unit_number ?? "—" },
          { label: "Portée", value: UNIT_SCOPE_LABELS[p.unit_scope] ?? p.unit_scope },
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

      <p class="text-sm text-slate-500 dark:text-slate-400 mt-6">Baux, paiements, documents et maintenance liés arrivent aux prochaines étapes.</p>
    `;

    content.querySelector<HTMLButtonElement>("#edit-btn")!.addEventListener("click", async () => {
      const owners = await fetchOwners();
      openPropertyModal(owners, organizationId, refresh, p);
    });

    content.querySelector<HTMLButtonElement>("#delete-btn")!.addEventListener("click", () => {
      confirmDeleteProperty(p, () => {
        showToast("Bien supprimé");
        navigate("/admin/properties", { replace: true });
      });
    });

    content.querySelector<HTMLButtonElement>("#reactivate-btn")?.addEventListener("click", () => {
      openReactivateModal(p, organizationId, refresh);
    });
  }

  await refresh();
}
