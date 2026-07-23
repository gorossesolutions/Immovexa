import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { OwnerOption, Property, PropertyCommercialStatus, UnitScope } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { statusBadge, statusLabel } from "../../components/status-badge";
import { COMMERCIAL_STATUS_LABELS } from "../../lib/status-labels";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";

const PENCIL_ICON = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const TRASH_ICON = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

export const UNIT_SCOPE_LABELS: Record<UnitScope, string> = {
  entire_property: "Bien entier",
  floor_only: "Un étage",
  room_only: "Une chambre",
};

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Appartement",
  house: "Maison",
  office: "Bureau",
  commercial: "Commercial",
  land: "Terrain",
  other: "Autre",
};

export const OWNERSHIP_SCHEME_LABELS: Record<string, string> = {
  freehold: "Pleine propriété",
  irs: "IRS",
  res: "RES",
  pds: "PDS",
  ghs: "GHS",
  none: "Aucun",
};

async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    showToast("Erreur de chargement des biens", "error");
    return [];
  }
  return data as Property[];
}

export async function fetchCommercialStatuses(): Promise<Map<string, string>> {
  const { data } = await supabase.from("property_commercial_status").select("*");
  return new Map((data as PropertyCommercialStatus[] | null ?? []).map((s) => [s.property_id, s.commercial_status]));
}

export async function fetchOwners(): Promise<OwnerOption[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "owner")
    .order("full_name");
  if (error) return [];
  return data as OwnerOption[];
}

function propertyFormHtml(owners: OwnerOption[], property?: Property): string {
  const ownerOptions = owners
    .map((o) => `<option value="${o.id}" ${property?.owner_id === o.id ? "selected" : ""}>${o.full_name}</option>`)
    .join("");

  const typeOptions = Object.entries(PROPERTY_TYPE_LABELS)
    .map(([value, label]) => `<option value="${value}" ${property?.property_type === value ? "selected" : ""}>${label}</option>`)
    .join("");

  const statusOptions = ["vacant", "occupied", "maintenance", "archived"]
    .map((s) => `<option value="${s}" ${property?.status === s ? "selected" : ""}>${statusLabel(s)}</option>`)
    .join("");

  const currencyOptions = ["MUR", "EUR", "USD"]
    .map((c) => `<option value="${c}" ${(property?.currency ?? "MUR") === c ? "selected" : ""}>${c}</option>`)
    .join("");

  const ownershipOptions = Object.entries(OWNERSHIP_SCHEME_LABELS)
    .map(([value, label]) => `<option value="${value}" ${property?.ownership_scheme === value ? "selected" : ""}>${label}</option>`)
    .join("");

  const unitScopeOptions = Object.entries(UNIT_SCOPE_LABELS)
    .map(([value, label]) => `<option value="${value}" ${(property?.unit_scope ?? "entire_property") === value ? "selected" : ""}>${label}</option>`)
    .join("");

  return `
    <form id="property-form" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Référence *</label>
          <input name="reference" required value="${property?.reference ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Type *</label>
          <select name="property_type" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${typeOptions}</select>
        </div>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Adresse *</label>
        <input name="address_line" required value="${property?.address_line ?? ""}"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Ville *</label>
          <input name="city" required value="${property?.city ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Région</label>
          <input name="region" value="${property?.region ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Code postal</label>
          <input name="postal_code" value="${property?.postal_code ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Propriétaire *</label>
        <select name="owner_id" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
          <option value="">Sélectionner…</option>${ownerOptions}
        </select>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Surface (m²)</label>
          <input name="surface_area" type="number" step="0.01" value="${property?.surface_area ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Pièces</label>
          <input name="rooms" type="number" value="${property?.rooms ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Chambres</label>
          <input name="bedrooms" type="number" value="${property?.bedrooms ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">SDB</label>
          <input name="bathrooms" type="number" value="${property?.bathrooms ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Régime de propriété</label>
          <select name="ownership_scheme" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${ownershipOptions}</select>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Devise</label>
          <select name="currency" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${currencyOptions}</select>
        </div>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 -mt-2">Le loyer ou le prix de vente se définit désormais via une annonce (listing) liée à ce bien.</p>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Étage</label>
          <input name="floor_level" value="${property?.floor_level ?? ""}" placeholder="ex: RDC, 2"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">N° unité</label>
          <input name="unit_number" value="${property?.unit_number ?? ""}" placeholder="ex: 3B"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Portée</label>
          <select name="unit_scope" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${unitScopeOptions}</select>
        </div>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 -mt-2">Étage/unité surtout pertinents pour un appartement — laissez libre pour une maison divisée par étage.</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Statut</label>
          <select name="status" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${statusOptions}</select>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 pb-2">
          <input type="checkbox" name="furnished" ${property?.furnished ? "checked" : ""} />
          Meublé
        </label>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Description</label>
        <textarea name="description" rows="3"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${property?.description ?? ""}</textarea>
      </div>

      <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
          ${property ? "Enregistrer" : "Créer le bien"}
        </button>
      </div>
    </form>
  `;
}

function readFormPayload(form: HTMLFormElement) {
  const fd = new FormData(form);
  const num = (key: string) => {
    const v = fd.get(key);
    return v && String(v).trim() !== "" ? Number(v) : null;
  };
  return {
    reference: String(fd.get("reference") ?? "").trim(),
    property_type: String(fd.get("property_type")),
    address_line: String(fd.get("address_line") ?? "").trim(),
    city: String(fd.get("city") ?? "").trim(),
    region: String(fd.get("region") ?? "").trim() || null,
    postal_code: String(fd.get("postal_code") ?? "").trim() || null,
    owner_id: String(fd.get("owner_id")),
    surface_area: num("surface_area"),
    rooms: num("rooms"),
    bedrooms: num("bedrooms"),
    bathrooms: num("bathrooms"),
    ownership_scheme: String(fd.get("ownership_scheme") ?? "").trim() || null,
    floor_level: String(fd.get("floor_level") ?? "").trim() || null,
    unit_number: String(fd.get("unit_number") ?? "").trim() || null,
    unit_scope: String(fd.get("unit_scope") ?? "entire_property"),
    currency: String(fd.get("currency")),
    status: String(fd.get("status")),
    furnished: fd.get("furnished") === "on",
    description: String(fd.get("description") ?? "").trim() || null,
  };
}

export async function openPropertyModal(
  owners: OwnerOption[],
  organizationId: string,
  onSaved: () => void,
  property?: Property
) {
  openModal(property ? `Modifier ${property.reference}` : "Nouveau bien", propertyFormHtml(owners, property));

  const form = modalBody().querySelector<HTMLFormElement>("#property-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const payload = readFormPayload(form);

    if (!payload.owner_id) {
      errorEl.textContent = "Sélectionnez un propriétaire.";
      errorEl.classList.remove("hidden");
      return;
    }

    const { error } = property
      ? await supabase.from("properties").update(payload).eq("id", property.id)
      : await supabase.from("properties").insert({ ...payload, organization_id: organizationId });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast(property ? "Bien mis à jour" : "Bien créé");
    onSaved();
  });
}

export async function confirmDeleteProperty(property: Property, onDeleted: () => void) {
  openModal(
    "Supprimer le bien",
    `
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Supprimer <strong>${property.reference}</strong> supprimera aussi ses baux, paiements et documents liés. Cette action est irréversible.
      </p>
      <div class="flex justify-end gap-3 pt-6">
        <button id="cancel-delete" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button id="confirm-delete" class="rounded-md bg-red-600 text-white text-sm font-medium px-4 py-2 hover:opacity-90">Supprimer</button>
      </div>
    `
  );

  modalBody().querySelector<HTMLButtonElement>("#cancel-delete")!.addEventListener("click", closeModal);
  modalBody().querySelector<HTMLButtonElement>("#confirm-delete")!.addEventListener("click", async () => {
    const { error } = await supabase.from("properties").delete().eq("id", property.id);
    closeModal();
    if (error) {
      showToast("Erreur lors de la suppression", "error");
      return;
    }
    showToast("Bien supprimé");
    onDeleted();
  });
}

export async function renderAdminProperties() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin/properties");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Biens</h1>
      <button id="new-property" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
        Nouveau bien
      </button>
    </div>
    <div id="properties-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#properties-table")!;

  async function refresh() {
    const [properties, owners, commercialStatuses] = await Promise.all([
      fetchProperties(),
      fetchOwners(),
      fetchCommercialStatuses(),
    ]);
    renderDataTable(tableEl, {
      rows: properties,
      emptyMessage: "Aucun bien enregistré.",
      onRowClick: (p) => navigate(`/admin/properties/${p.id}`),
      columns: [
        { label: "Référence", render: (p) => `<span class="font-medium">${p.reference}</span>` },
        { label: "Adresse", render: (p) => `${p.address_line}, ${p.city}` },
        { label: "Type", render: (p) => PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type },
        { label: "Régime", render: (p) => (p.ownership_scheme ? OWNERSHIP_SCHEME_LABELS[p.ownership_scheme] ?? p.ownership_scheme : "—") },
        { label: "Statut", render: (p) => statusBadge(p.status) },
        {
          label: "Statut commercial",
          render: (p) => {
            const cs = commercialStatuses.get(p.id) ?? "no_active_listing";
            return statusBadge(cs, COMMERCIAL_STATUS_LABELS[cs] ?? cs);
          },
        },
      ],
      filters: [
        { key: "status", label: "Statut", value: (p) => statusLabel(p.status) },
        { key: "property_type", label: "Type", value: (p) => PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type },
      ],
      actions: [
        {
          label: "Modifier",
          icon: PENCIL_ICON,
          variant: "solid",
          onClick: (p) => openPropertyModal(owners, organizationId, refresh, p),
        },
        {
          label: "Supprimer",
          icon: TRASH_ICON,
          variant: "solid-danger",
          onClick: (p) => confirmDeleteProperty(p, refresh),
        },
      ],
    });
  }

  content.querySelector<HTMLButtonElement>("#new-property")!.addEventListener("click", async () => {
    const owners = await fetchOwners();
    openPropertyModal(owners, organizationId, refresh);
  });

  await refresh();
}
