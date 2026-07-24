import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Listing, ListingType } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { statusBadge } from "../../components/status-badge";
import { LISTING_STATUS_LABELS, LISTING_TYPE_LABELS } from "../../lib/status-labels";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";

interface PropertyOption {
  id: string;
  reference: string;
  city: string;
}

interface ListingRow extends Listing {
  property?: PropertyOption;
}

async function fetchPropertyOptions(): Promise<PropertyOption[]> {
  const { data } = await supabase.from("properties").select("id, reference, city").order("reference");
  return (data as PropertyOption[] | null) ?? [];
}

async function fetchListings(): Promise<ListingRow[]> {
  const [{ data: listings, error }, properties] = await Promise.all([
    supabase.from("listings").select("*").order("created_at", { ascending: false }),
    fetchPropertyOptions(),
  ]);
  if (error) {
    showToast("Erreur de chargement des annonces", "error");
    return [];
  }
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  return (listings as Listing[]).map((l) => ({ ...l, property: propertyById.get(l.property_id) }));
}

function priceCellHtml(l: Listing): string {
  const amount =
    l.listing_type === "sale" ? l.price : l.listing_type === "long_term_rental" ? l.monthly_rent : l.nightly_rate;
  if (amount === null || amount === undefined) return `<span class="block text-right">—</span>`;
  return `<span class="block text-right tabular-nums">${amount.toLocaleString("fr-FR")} ${l.currency}</span>`;
}

function listingFormHtml(properties: PropertyOption[]): string {
  const propertyOptions = properties.map((p) => `<option value="${p.id}">${p.reference} — ${p.city}</option>`).join("");
  const typeOptions = Object.entries(LISTING_TYPE_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");

  return `
    <form id="listing-form" class="space-y-4">
      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Bien *</label>
        <select name="property_id" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
          <option value="">Sélectionner…</option>${propertyOptions}
        </select>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Type d'annonce *</label>
        <select name="listing_type" id="listing-type-select" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${typeOptions}</select>
      </div>

      <div id="price-field-sale">
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Prix de vente</label>
        <input name="price" type="number" step="0.01"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
      </div>
      <div id="price-field-long_term_rental" class="hidden">
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Loyer mensuel</label>
        <input name="monthly_rent" type="number" step="0.01"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
      </div>
      <div id="price-field-short_term_rental" class="hidden">
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Tarif / nuit</label>
        <input name="nightly_rate" type="number" step="0.01"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Devise</label>
          <select name="currency" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
            <option value="MUR">MUR</option><option value="EUR">EUR</option><option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Commission (%)</label>
          <input name="commission_rate" type="number" step="0.01"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
      <div id="reactivation-actions" class="hidden">
        <button type="button" id="reactivate-btn" class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">Réactiver quand même</button>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">Créer l'annonce</button>
      </div>
    </form>
  `;
}

export async function openListingModal(organizationId: string, onSaved: () => void) {
  const properties = await fetchPropertyOptions();
  openModal("Nouvelle annonce", listingFormHtml(properties));

  const form = modalBody().querySelector<HTMLFormElement>("#listing-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  const typeSelect = modalBody().querySelector<HTMLSelectElement>("#listing-type-select")!;
  const reactivationActions = modalBody().querySelector<HTMLDivElement>("#reactivation-actions")!;
  const reactivateBtn = modalBody().querySelector<HTMLButtonElement>("#reactivate-btn")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  function syncPriceField() {
    (["sale", "long_term_rental", "short_term_rental"] as ListingType[]).forEach((t) => {
      modalBody().querySelector<HTMLDivElement>(`#price-field-${t}`)!.classList.toggle("hidden", typeSelect.value !== t);
    });
  }
  typeSelect.addEventListener("change", syncPriceField);
  syncPriceField();

  function readPayload() {
    const fd = new FormData(form);
    const num = (key: string) => {
      const v = fd.get(key);
      return v && String(v).trim() !== "" ? Number(v) : null;
    };
    return {
      property_id: String(fd.get("property_id")),
      listing_type: String(fd.get("listing_type")) as ListingType,
      price: num("price"),
      monthly_rent: num("monthly_rent"),
      nightly_rate: num("nightly_rate"),
      currency: String(fd.get("currency")),
      commission_rate: num("commission_rate"),
    };
  }

  reactivateBtn.addEventListener("click", async () => {
    const payload = readPayload();
    const { error } = await supabase.rpc("reactivate_property_listing", {
      p_organization_id: organizationId,
      p_property_id: payload.property_id,
      p_listing_type: payload.listing_type,
      p_price: payload.price,
      p_monthly_rent: payload.monthly_rent,
      p_nightly_rate: payload.nightly_rate,
      p_currency: payload.currency,
      p_commission_rate: payload.commission_rate,
    });
    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }
    closeModal();
    showToast("Annonce réactivée");
    onSaved();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    reactivationActions.classList.add("hidden");
    const payload = readPayload();

    if (!payload.property_id) {
      errorEl.textContent = "Sélectionnez un bien.";
      errorEl.classList.remove("hidden");
      return;
    }

    const { error } = await supabase.from("listings").insert({ ...payload, organization_id: organizationId, status: "draft" });

    if (error) {
      if (error.message.includes("RELIST_BLOCKED")) {
        errorEl.textContent = "Ce bien a une vente déjà finalisée. Utilisez la réactivation explicite pour créer une nouvelle annonce.";
        errorEl.classList.remove("hidden");
        reactivationActions.classList.remove("hidden");
        return;
      }
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast("Annonce créée");
    onSaved();
  });
}

export async function renderAdminListings() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin/listings");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Annonces</h1>
      <button id="new-listing" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
        Nouvelle annonce
      </button>
    </div>
    <div id="listings-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#listings-table")!;

  async function refresh() {
    const listings = await fetchListings();
    renderDataTable(tableEl, {
      rows: listings,
      emptyMessage: "Aucune annonce.",
      emptyCta: { label: "Nouvelle annonce", onClick: () => content.querySelector<HTMLButtonElement>("#new-listing")!.click() },
      onRowClick: (l) => navigate(`/admin/listings/${l.id}`),
      columns: [
        { label: "Bien", render: (l) => (l.property ? `${l.property.reference} — ${l.property.city}` : "—") },
        { label: "Type", render: (l) => LISTING_TYPE_LABELS[l.listing_type] ?? l.listing_type },
        { label: "Prix / Loyer / Tarif", render: priceCellHtml },
        { label: "Statut", render: (l) => statusBadge(l.status, LISTING_STATUS_LABELS[l.status] ?? l.status) },
      ],
      filters: [
        { key: "listing_type", label: "Type", value: (l) => LISTING_TYPE_LABELS[l.listing_type] ?? l.listing_type },
        { key: "status", label: "Statut", value: (l) => LISTING_STATUS_LABELS[l.status] ?? l.status },
      ],
    });
  }

  content.querySelector<HTMLButtonElement>("#new-listing")!.addEventListener("click", () => {
    openListingModal(organizationId, refresh);
  });

  await refresh();
}
