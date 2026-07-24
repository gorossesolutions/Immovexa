import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Property, PropertyOwner, PropertyPhoto } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge } from "../../components/status-badge";
import { renderDetailCard, CARD_CLASSES } from "../../components/detail-table";
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
  fetchPropertyOwners,
  openPropertyModal,
} from "./properties";

async function fetchProperty(id: string): Promise<Property | null> {
  const { data, error } = await supabase.from("properties").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data as Property;
}

async function fetchCommercialStatus(propertyId: string): Promise<string> {
  const { data } = await supabase
    .from("property_commercial_status")
    .select("commercial_status")
    .eq("property_id", propertyId)
    .single();
  return data?.commercial_status ?? "no_active_listing";
}

interface ChildLot {
  id: string;
  reference: string;
  surface_area: number | null;
}

async function fetchChildLots(propertyId: string): Promise<ChildLot[]> {
  const { data } = await supabase.from("properties").select("id, reference, surface_area").eq("parent_property_id", propertyId).order("reference");
  return data ?? [];
}

async function fetchParentProperty(parentId: string): Promise<{ id: string; reference: string } | null> {
  const { data } = await supabase.from("properties").select("id, reference").eq("id", parentId).single();
  return data ?? null;
}

// ============================================================
// Photos
// ============================================================

const MAX_PHOTOS = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "avif", "tiff"];

function photoUrl(filePath: string): string {
  return supabase.storage.from("property-photos").getPublicUrl(filePath).data.publicUrl;
}

async function fetchPropertyPhotos(propertyId: string): Promise<PropertyPhoto[]> {
  const { data } = await supabase.from("property_photos").select("*").eq("property_id", propertyId).order("position");
  return (data as PropertyPhoto[] | null) ?? [];
}

function validatePhotoFiles(files: File[], currentCount: number): string | null {
  if (currentCount + files.length > MAX_PHOTOS) {
    return `Maximum ${MAX_PHOTOS} photos par bien (${currentCount} déjà présentes).`;
  }
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return `Échec de l'import de « ${file.name} ». Le fichier doit être égal ou inférieur à 5 Mo.`;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Échec de l'import de « ${file.name} ». Seuls les fichiers de formats ${ALLOWED_EXTENSIONS.join(", ").toUpperCase()} sont supportés.`;
    }
  }
  return null;
}

async function uploadPhotos(
  files: File[],
  property: Property,
  organizationId: string,
  startPosition: number
): Promise<string | null> {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `${organizationId}/${property.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("property-photos").upload(path, file);
    if (uploadError) return uploadError.message;

    const { error: insertError } = await supabase
      .from("property_photos")
      .insert({ property_id: property.id, file_path: path, position: startPosition + i });
    if (insertError) {
      await supabase.storage.from("property-photos").remove([path]);
      return insertError.message;
    }
  }
  return null;
}

async function deletePhoto(photo: PropertyPhoto, onDone: () => void) {
  await supabase.storage.from("property-photos").remove([photo.file_path]);
  await supabase.from("property_photos").delete().eq("id", photo.id);
  onDone();
}

function photoGalleryHtml(photos: PropertyPhoto[]): string {
  if (photos.length === 0) {
    return `<p class="text-sm text-slate-500 dark:text-slate-400">Aucune photo pour ce bien.</p>`;
  }
  return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      ${photos
        .map(
          (p, i) => `
        <div class="relative group">
          <img src="${photoUrl(p.file_path)}" alt="" data-photo-index="${i}" class="photo-thumb w-full h-28 object-cover rounded-md border border-slate-200 dark:border-slate-800 cursor-pointer" />
          <button data-photo-id="${p.id}" class="delete-photo-btn absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
        </div>`
        )
        .join("")}
    </div>
  `;
}

function openPhotoLightbox(photos: PropertyPhoto[], startIndex: number) {
  let index = startIndex;
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-[60] bg-black/90 flex items-center justify-center";
  document.body.appendChild(overlay);

  function render() {
    overlay.innerHTML = `
      <button id="lightbox-close" aria-label="Fermer" class="absolute top-4 right-4 text-white/80 hover:text-white text-2xl leading-none">✕</button>
      ${photos.length > 1 ? `<button id="lightbox-prev" aria-label="Précédent" class="absolute left-4 text-white/80 hover:text-white text-3xl leading-none px-2">‹</button>` : ""}
      <img src="${photoUrl(photos[index].file_path)}" alt="" class="max-w-[90vw] max-h-[85vh] object-contain rounded-md" />
      ${photos.length > 1 ? `<button id="lightbox-next" aria-label="Suivant" class="absolute right-4 text-white/80 hover:text-white text-3xl leading-none px-2">›</button>` : ""}
      ${photos.length > 1 ? `<p class="absolute bottom-4 text-white/70 text-sm">${index + 1} / ${photos.length}</p>` : ""}
    `;
    overlay.querySelector<HTMLButtonElement>("#lightbox-close")!.addEventListener("click", close);
    overlay.querySelector<HTMLButtonElement>("#lightbox-prev")?.addEventListener("click", () => {
      index = (index - 1 + photos.length) % photos.length;
      render();
    });
    overlay.querySelector<HTMLButtonElement>("#lightbox-next")?.addEventListener("click", () => {
      index = (index + 1) % photos.length;
      render();
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") overlay.querySelector<HTMLButtonElement>("#lightbox-prev")?.click();
    if (e.key === "ArrowRight") overlay.querySelector<HTMLButtonElement>("#lightbox-next")?.click();
  }

  function close() {
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown);

  render();
}

function lotRowHtml(index: number, referencePlaceholder: string): string {
  return `
    <div class="lot-row grid grid-cols-[1fr_120px_auto] gap-2 items-center" data-row-index="${index}">
      <input class="lot-reference w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" placeholder="Référence (ex: ${referencePlaceholder})" />
      <input type="number" step="0.01" min="0" class="lot-surface w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" placeholder="Surface m²" />
      <button type="button" class="remove-row-btn text-slate-400 hover:text-red-600 dark:hover:text-red-400 px-2">✕</button>
    </div>
  `;
}

function openSubdivideModal(property: Property, organizationId: string, existingLots: ChildLot[], onDone: () => void) {
  const existingTotal = existingLots.reduce((sum, l) => sum + (l.surface_area ?? 0), 0);
  const hasSurfaceLimit = property.surface_area != null;
  const remaining = hasSurfaceLimit ? property.surface_area! - existingTotal : null;
  const fullySubdivided = remaining !== null && remaining <= 0;

  const existingLotsHtml = existingLots.length
    ? `
      <div class="mb-4">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1.5">Lots déjà créés</p>
        <div class="space-y-1">
          ${existingLots
            .map(
              (l) =>
                `<a href="/admin/properties/${l.id}" data-link id="existing-lot-${l.id}" class="flex items-center justify-between text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">
                  <span>${l.reference}</span><span class="text-slate-400 dark:text-slate-500">${l.surface_area ? `${l.surface_area} m²` : "—"}</span>
                </a>`
            )
            .join("")}
        </div>
      </div>
    `
    : "";

  const fullySubdividedBanner = fullySubdivided
    ? `<div class="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-sm px-4 py-3 mb-4">
         ${existingLots.length} lot${existingLots.length > 1 ? "s" : ""} subdivisé${existingLots.length > 1 ? "s" : ""} totalisant déjà la superficie totale du bien (${property.surface_area} m²). Pas de subdivision supplémentaire possible.
       </div>`
    : "";

  openModal(
    "Subdiviser en lots",
    `
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Crée un ou plusieurs biens enfants liés à <strong>${property.reference}</strong>. Le terrain parent reste inchangé et reste vendable en parallèle.
        Les nouveaux lots héritent des propriétaires et de la commission actuels de ${property.reference} (modifiables ensuite).
      </p>
      ${existingLotsHtml}
      ${fullySubdividedBanner}
      <form id="subdivide-form" class="space-y-3 ${fullySubdivided ? "hidden" : ""}">
        <div id="lot-rows" class="space-y-2">${lotRowHtml(0, `${property.reference}-A`)}</div>
        <button type="button" id="add-lot-row" class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">+ Ajouter un lot</button>
        ${hasSurfaceLimit ? `<p id="remaining-surface" class="text-xs text-slate-500 dark:text-slate-400">Superficie restante : ${remaining} m²</p>` : ""}
        <p id="subdivide-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" id="cancel-subdivide" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
          <button type="submit" id="submit-subdivide" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">Créer les lots</button>
        </div>
      </form>
    `
  );

  modalBody().querySelector<HTMLButtonElement>("#cancel-subdivide")!.addEventListener("click", closeModal);
  existingLots.forEach((l) => {
    modalBody().querySelector<HTMLAnchorElement>(`#existing-lot-${l.id}`)?.addEventListener("click", closeModal);
  });

  if (fullySubdivided) return;

  const form = modalBody().querySelector<HTMLFormElement>("#subdivide-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#subdivide-error")!;
  const rowsContainer = modalBody().querySelector<HTMLDivElement>("#lot-rows")!;
  const submitBtn = modalBody().querySelector<HTMLButtonElement>("#submit-subdivide")!;
  const remainingEl = modalBody().querySelector<HTMLParagraphElement>("#remaining-surface");
  let rowCount = 1;

  function currentNewTotal(): number {
    return Array.from(rowsContainer.querySelectorAll<HTMLInputElement>(".lot-surface")).reduce(
      (sum, input) => sum + (Number(input.value) || 0),
      0
    );
  }

  function updateRemaining() {
    if (!hasSurfaceLimit) return;
    const newTotal = currentNewTotal();
    const left = remaining! - newTotal;
    remainingEl!.textContent = `Superficie restante : ${left} m²`;
    const over = left < 0;
    remainingEl!.classList.toggle("text-red-600", over);
    remainingEl!.classList.toggle("dark:text-red-400", over);
    submitBtn.disabled = over;
  }

  function wireRow(row: HTMLElement) {
    row.querySelector<HTMLInputElement>(".lot-surface")!.addEventListener("input", updateRemaining);
    row.querySelector<HTMLButtonElement>(".remove-row-btn")!.addEventListener("click", () => {
      if (rowsContainer.children.length > 1) {
        row.remove();
        updateRemaining();
      }
    });
  }
  wireRow(rowsContainer.querySelector(".lot-row")!);

  modalBody().querySelector<HTMLButtonElement>("#add-lot-row")!.addEventListener("click", () => {
    rowCount += 1;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = lotRowHtml(rowCount, `${property.reference}-${String.fromCharCode(65 + rowCount - 1)}`);
    const row = wrapper.firstElementChild as HTMLElement;
    rowsContainer.appendChild(row);
    wireRow(row);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const rows = Array.from(rowsContainer.querySelectorAll<HTMLElement>(".lot-row")).map((row) => ({
      reference: row.querySelector<HTMLInputElement>(".lot-reference")!.value.trim(),
      surface_area: row.querySelector<HTMLInputElement>(".lot-surface")!.value.trim(),
    }));

    const validRows = rows.filter((r) => r.reference);
    if (validRows.length === 0) {
      errorEl.textContent = "Indiquez au moins une référence de lot.";
      errorEl.classList.remove("hidden");
      return;
    }

    const newTotal = validRows.reduce((sum, r) => sum + (r.surface_area ? Number(r.surface_area) : 0), 0);
    if (hasSurfaceLimit && newTotal > remaining!) {
      errorEl.textContent = `La superficie totale des nouveaux lots (${newTotal} m²) dépasse la superficie restante du bien (${remaining} m²).`;
      errorEl.classList.remove("hidden");
      return;
    }

    const parentOwners = await fetchPropertyOwners(property.id);

    for (const row of validRows) {
      const { data: child, error } = await supabase
        .from("properties")
        .insert({
          organization_id: organizationId,
          reference: row.reference,
          address_line: property.address_line,
          city: property.city,
          region: property.region,
          postal_code: property.postal_code,
          property_type: property.property_type,
          status: "vacant",
          ownership_scheme: property.ownership_scheme,
          currency: property.currency,
          commission_rate: property.commission_rate,
          surface_area: row.surface_area ? Number(row.surface_area) : null,
          parent_property_id: property.id,
        })
        .select("id")
        .single();

      if (error || !child) {
        errorEl.textContent = error?.message ?? `Erreur lors de la création du lot ${row.reference}`;
        errorEl.classList.remove("hidden");
        return;
      }

      if (parentOwners.length > 0) {
        await supabase
          .from("property_owners")
          .insert(parentOwners.map((o) => ({ property_id: child.id, owner_id: o.owner_id, ownership_percentage: o.ownership_percentage })));
      }
    }

    closeModal();
    showToast(`${validRows.length} lot(s) créé(s)`);
    onDone();
  });
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
    const owners = refreshedProperty ? await fetchPropertyOwners(refreshedProperty.id) : [];
    const childLots = refreshedProperty ? await fetchChildLots(refreshedProperty.id) : [];
    const parentProperty = refreshedProperty?.parent_property_id
      ? await fetchParentProperty(refreshedProperty.parent_property_id)
      : null;
    const photos = refreshedProperty ? await fetchPropertyPhotos(refreshedProperty.id) : [];
    draw(refreshedProperty, refreshedStatus, owners, childLots, parentProperty, photos);
  }

  function draw(
    p: Property | null,
    commercialStatus: string,
    owners: PropertyOwner[],
    childLots: ChildLot[],
    parentProperty: { id: string; reference: string } | null,
    photos: PropertyPhoto[]
  ) {
    if (!p) return;
    const underOfferBanner =
      commercialStatus === "under_offer"
        ? `<div class="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm px-4 py-3 mb-6">
             Ce bien est actuellement sous offre — une vente est en cours de finalisation.
           </div>`
        : "";

    const ownersHtml = owners.length
      ? owners.map((o) => `${o.full_name}${o.ownership_percentage !== null ? ` (${o.ownership_percentage}%)` : ""}`).join(", ")
      : "—";

    const parentBreadcrumb = parentProperty
      ? `<p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Issu de <a href="/admin/properties/${parentProperty.id}" data-link class="text-secondary-fg dark:text-secondary-fg-dark hover:underline">${parentProperty.reference}</a></p>`
      : "";

    const lotsBadge = childLots.length
      ? `<span class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">${childLots.length} lot${childLots.length > 1 ? "s" : ""} créé${childLots.length > 1 ? "s" : ""}</span>`
      : "";

    content.innerHTML = `
      <a href="/admin/properties" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour aux biens</a>
      <div class="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${p.reference}</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400">${p.address_line}, ${p.city}${p.region ? ", " + p.region : ""}</p>
          ${parentBreadcrumb}
        </div>
        <div class="flex items-center gap-3">
          ${statusBadge(p.status)}
          ${statusBadge(commercialStatus, COMMERCIAL_STATUS_LABELS[commercialStatus] ?? commercialStatus)}
          ${lotsBadge}
          ${
            commercialStatus === "sold"
              ? `<button id="reactivate-btn" class="rounded-md border border-secondary text-secondary-fg dark:text-secondary-fg-dark text-sm px-3 py-1.5 hover:bg-secondary/10">Réactiver ce bien à la vente</button>`
              : ""
          }
          ${
            p.property_type === "land"
              ? `<button id="subdivide-btn" class="rounded-md border border-secondary text-secondary-fg dark:text-secondary-fg-dark text-sm px-3 py-1.5 hover:bg-secondary/10">Subdiviser en lots</button>`
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
          { label: "Propriétaire(s)", value: ownersHtml },
          { label: "Régime de propriété", value: p.ownership_scheme ? OWNERSHIP_SCHEME_LABELS[p.ownership_scheme] ?? p.ownership_scheme : "—" },
          { label: "Commission", value: p.commission_rate !== null ? `${p.commission_rate}%` : "—" },
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

      <div class="${CARD_CLASSES} p-6 mt-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Photos <span class="text-xs font-normal text-slate-400">(${photos.length}/${MAX_PHOTOS})</span></h2>
          <label class="rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            Ajouter des photos
            <input id="photo-input" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/tiff" multiple class="hidden" />
          </label>
        </div>
        <p id="photo-error" class="text-sm text-red-600 dark:text-red-400 hidden mb-3"></p>
        ${photoGalleryHtml(photos)}
      </div>

      <p class="text-sm text-slate-500 dark:text-slate-400 mt-6">Baux, paiements, documents et maintenance liés arrivent aux prochaines étapes.</p>
    `;

    const photoError = content.querySelector<HTMLParagraphElement>("#photo-error")!;
    content.querySelector<HTMLInputElement>("#photo-input")!.addEventListener("change", async (e) => {
      const input = e.target as HTMLInputElement;
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      photoError.classList.add("hidden");

      const validationError = validatePhotoFiles(files, photos.length);
      if (validationError) {
        photoError.textContent = validationError;
        photoError.classList.remove("hidden");
        input.value = "";
        return;
      }

      const uploadError = await uploadPhotos(files, p, organizationId, photos.length);
      if (uploadError) {
        photoError.textContent = uploadError;
        photoError.classList.remove("hidden");
        return;
      }

      refresh();
    });

    content.querySelectorAll<HTMLButtonElement>(".delete-photo-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const photo = photos.find((ph) => ph.id === btn.dataset.photoId);
        if (photo) deletePhoto(photo, refresh);
      });
    });

    content.querySelectorAll<HTMLImageElement>(".photo-thumb").forEach((img) => {
      img.addEventListener("click", () => {
        openPhotoLightbox(photos, Number(img.dataset.photoIndex));
      });
    });

    content.querySelector<HTMLButtonElement>("#edit-btn")!.addEventListener("click", async () => {
      const ownerOptions = await fetchOwners();
      openPropertyModal(ownerOptions, organizationId, refresh, p);
    });

    content.querySelector<HTMLButtonElement>("#delete-btn")!.addEventListener("click", () => {
      confirmDeleteProperty(p, () => {
        showToast("Bien supprimé");
        navigate("/admin/properties", { replace: true });
      });
    });

    content.querySelector<HTMLButtonElement>("#subdivide-btn")?.addEventListener("click", () => {
      openSubdivideModal(p, organizationId, childLots, refresh);
    });

    content.querySelector<HTMLButtonElement>("#reactivate-btn")?.addEventListener("click", () => {
      openReactivateModal(p, organizationId, refresh);
    });
  }

  await refresh();
}
