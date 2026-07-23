import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { BookingSource, BookingStatus, Listing, Sale, SaleStatus, ShortTermBooking } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge } from "../../components/status-badge";
import { renderDetailCard, CARD_CLASSES } from "../../components/detail-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { showToast } from "../../components/toast";
import {
  BOOKING_SOURCE_LABELS,
  BOOKING_STATUS_LABELS,
  LISTING_STATUS_LABELS,
  LISTING_TYPE_LABELS,
  SALE_STATUS_LABELS,
} from "../../lib/status-labels";

interface PropertyInfo {
  reference: string;
  city: string;
}

type ListingDetail = Listing & { properties: PropertyInfo | null };

async function fetchListing(id: string): Promise<ListingDetail | null> {
  const { data, error } = await supabase.from("listings").select("*, properties(reference, city)").eq("id", id).single();
  if (error || !data) return null;
  return data as unknown as ListingDetail;
}

async function fetchSale(listingId: string): Promise<Sale | null> {
  const { data } = await supabase
    .from("sales")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Sale | null;
}

async function fetchBookings(listingId: string): Promise<ShortTermBooking[]> {
  const { data } = await supabase
    .from("short_term_bookings")
    .select("*")
    .eq("listing_id", listingId)
    .order("check_in", { ascending: false });
  return (data as ShortTermBooking[] | null) ?? [];
}

function computeCommission(base: number, ratePercent: number): number {
  return Math.round(base * ratePercent) / 100;
}

function saleFormHtml(listing: ListingDetail, sale?: Sale | null): string {
  const statusOptions = Object.entries(SALE_STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}" ${sale?.status === value ? "selected" : ""}>${label}</option>`)
    .join("");
  const initialRate = listing.commission_rate ?? "";
  const initialBase = sale?.agreed_price ?? sale?.offer_price ?? 0;
  const initialCommission =
    listing.commission_rate != null ? computeCommission(initialBase, listing.commission_rate).toFixed(2) : (sale?.commission_amount ?? "");

  return `
    <form id="sale-form" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Nom de l'acheteur *</label>
          <input name="buyer_name" required value="${sale?.buyer_name ?? ""}" placeholder="Prénom et nom"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Contact</label>
          <input name="buyer_contact" value="${sale?.buyer_contact ?? ""}" placeholder="Email ou téléphone"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Prix offert</label>
          <input name="offer_price" id="offer-price-input" type="number" step="0.01" value="${sale?.offer_price ?? ""}" placeholder="Prix proposé par l'acheteur"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Prix convenu</label>
          <input name="agreed_price" id="agreed-price-input" type="number" step="0.01" value="${sale?.agreed_price ?? ""}" placeholder="Prix final convenu"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Statut</label>
        <select name="status" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${statusOptions}</select>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Date compromis</label>
          <input name="compromis_date" type="date" value="${sale?.compromis_date ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Date acte</label>
          <input name="deed_date" type="date" value="${sale?.deed_date ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Notaire</label>
        <input name="notary_name" value="${sale?.notary_name ?? ""}" placeholder="Nom de l'étude notariale"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Taux de commission (%)</label>
          <input name="commission_rate" id="commission-rate-input" type="number" step="0.01" min="0" max="100" value="${initialRate}" placeholder="ex: 3"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Montant de la commission</label>
          <input id="commission-amount-display" type="text" readonly value="${initialCommission}" placeholder="Calculé automatiquement"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm cursor-not-allowed" />
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Taux × prix convenu (ou prix offert à défaut)</p>
        </div>
      </div>
      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Notes</label>
        <textarea name="notes" rows="2" placeholder="Notes internes"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm">${sale?.notes ?? ""}</textarea>
      </div>
      <p id="sale-form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="cancel-sale-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
          ${sale ? "Enregistrer" : "Créer la vente"}
        </button>
      </div>
    </form>
  `;
}

async function openSaleModal(listing: ListingDetail, sale: Sale | null, onSaved: () => void) {
  openModal(sale ? "Modifier la vente" : "Créer la vente", saleFormHtml(listing, sale));
  const form = modalBody().querySelector<HTMLFormElement>("#sale-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#sale-form-error")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-sale-btn")!.addEventListener("click", closeModal);

  const rateInput = modalBody().querySelector<HTMLInputElement>("#commission-rate-input")!;
  const offerInput = modalBody().querySelector<HTMLInputElement>("#offer-price-input")!;
  const agreedInput = modalBody().querySelector<HTMLInputElement>("#agreed-price-input")!;
  const commissionDisplay = modalBody().querySelector<HTMLInputElement>("#commission-amount-display")!;

  function recomputeCommission() {
    const rate = Number(rateInput.value) || 0;
    const base = Number(agreedInput.value) || Number(offerInput.value) || 0;
    commissionDisplay.value = rate > 0 && base > 0 ? computeCommission(base, rate).toFixed(2) : "";
  }
  [rateInput, offerInput, agreedInput].forEach((el) => el.addEventListener("input", recomputeCommission));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const fd = new FormData(form);
    const num = (key: string) => {
      const v = fd.get(key);
      return v && String(v).trim() !== "" ? Number(v) : null;
    };
    const str = (key: string) => String(fd.get(key) ?? "").trim() || null;
    const rate = num("commission_rate");
    const base = num("agreed_price") ?? num("offer_price") ?? 0;
    const payload = {
      buyer_name: String(fd.get("buyer_name") ?? "").trim(),
      buyer_contact: str("buyer_contact"),
      offer_price: num("offer_price"),
      agreed_price: num("agreed_price"),
      status: String(fd.get("status")) as SaleStatus,
      compromis_date: str("compromis_date"),
      deed_date: str("deed_date"),
      notary_name: str("notary_name"),
      commission_amount: rate != null ? computeCommission(base, rate) : null,
      notes: str("notes"),
    };

    const { error } = sale
      ? await supabase.from("sales").update(payload).eq("id", sale.id)
      : await supabase.from("sales").insert({ ...payload, organization_id: listing.organization_id, listing_id: listing.id });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    if (rate !== listing.commission_rate) {
      await supabase.from("listings").update({ commission_rate: rate }).eq("id", listing.id);
    }
    closeModal();
    showToast(sale ? "Vente mise à jour" : "Vente créée");
    onSaved();
  });
}

function bookingFormHtml(): string {
  const sourceOptions = Object.entries(BOOKING_SOURCE_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  return `
    <form id="booking-form" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Nom du client *</label>
          <input name="guest_name" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Contact</label>
          <input name="guest_contact" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Arrivée *</label>
          <input name="check_in" type="date" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Départ *</label>
          <input name="check_out" type="date" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Tarif / nuit *</label>
          <input name="nightly_rate" type="number" step="0.01" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Montant total *</label>
          <input name="total_amount" type="number" step="0.01" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Dépôt</label>
          <input name="deposit_amount" type="number" step="0.01" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Déjà payé</label>
          <input name="amount_paid" type="number" step="0.01" value="0" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Source</label>
          <select name="source" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${sourceOptions}</select>
        </div>
      </div>
      <p id="booking-form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="cancel-booking-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">Créer la réservation</button>
      </div>
    </form>
  `;
}

async function openBookingModal(listing: ListingDetail, onSaved: () => void) {
  openModal("Nouvelle réservation", bookingFormHtml());
  const form = modalBody().querySelector<HTMLFormElement>("#booking-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#booking-form-error")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-booking-btn")!.addEventListener("click", closeModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const fd = new FormData(form);
    const payload = {
      guest_name: String(fd.get("guest_name") ?? "").trim(),
      guest_contact: String(fd.get("guest_contact") ?? "").trim() || null,
      check_in: String(fd.get("check_in")),
      check_out: String(fd.get("check_out")),
      nightly_rate: Number(fd.get("nightly_rate")),
      total_amount: Number(fd.get("total_amount")),
      deposit_amount: fd.get("deposit_amount") ? Number(fd.get("deposit_amount")) : null,
      amount_paid: Number(fd.get("amount_paid") ?? 0),
      source: String(fd.get("source")) as BookingSource,
      status: "confirmed" as BookingStatus,
    };

    const { error } = await supabase.from("short_term_bookings").insert({
      ...payload,
      organization_id: listing.organization_id,
      listing_id: listing.id,
      property_id: listing.property_id,
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }
    closeModal();
    showToast("Réservation créée");
    onSaved();
  });
}

export async function renderAdminListingDetail(params: Record<string, string>) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/admin/listings");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const listing = await fetchListing(params.id);
  if (!listing) {
    content.innerHTML = `<p class="text-sm text-red-600">Annonce introuvable.</p>`;
    return;
  }

  async function draw() {
    const current = await fetchListing(params.id);
    if (!current) {
      content.innerHTML = `<p class="text-sm text-red-600">Annonce introuvable.</p>`;
      return;
    }

    const statusOptions = Object.entries(LISTING_STATUS_LABELS)
      .map(([value, label]) => `<option value="${value}" ${current.status === value ? "selected" : ""}>${label}</option>`)
      .join("");

    let extraSectionHtml = "";
    if (current.listing_type === "sale") {
      const sale = await fetchSale(current.id);
      extraSectionHtml = `
        <div class="${CARD_CLASSES} p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Vente</h2>
            <button id="sale-btn" class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">${sale ? "Modifier" : "Créer la vente"}</button>
          </div>
          ${
            sale
              ? renderDetailCard(
                  [
                    { label: "Acheteur", value: sale.buyer_name },
                    { label: "Contact", value: sale.buyer_contact ?? "—" },
                    { label: "Statut", value: SALE_STATUS_LABELS[sale.status] ?? sale.status },
                    { label: "Prix offert", value: sale.offer_price ? `${sale.offer_price.toLocaleString("fr-FR")} ${current.currency}` : "—" },
                    { label: "Prix convenu", value: sale.agreed_price ? `${sale.agreed_price.toLocaleString("fr-FR")} ${current.currency}` : "—" },
                    { label: "Commission", value: sale.commission_amount ? `${sale.commission_amount.toLocaleString("fr-FR")} ${current.currency}` : "—" },
                    { label: "Notaire", value: sale.notary_name ?? "—" },
                    { label: "Date acte", value: sale.deed_date ?? "—" },
                  ],
                  2
                )
              : `<p class="text-sm text-slate-500 dark:text-slate-400">Aucune vente enregistrée pour cette annonce.</p>`
          }
        </div>
      `;
    } else if (current.listing_type === "short_term_rental") {
      const bookings = await fetchBookings(current.id);
      const rows = bookings
        .map(
          (b) => `
        <tr class="border-t border-slate-100 dark:border-slate-800">
          <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${b.guest_name}</td>
          <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${b.check_in} → ${b.check_out}</td>
          <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 text-right tabular-nums">${b.nights}</td>
          <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 text-right tabular-nums">${b.total_amount.toLocaleString("fr-FR")} ${current.currency}</td>
          <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 text-right tabular-nums">${b.amount_paid.toLocaleString("fr-FR")} ${current.currency}</td>
          <td class="px-4 py-3">${statusBadge(b.status, BOOKING_STATUS_LABELS[b.status] ?? b.status)}</td>
        </tr>`
        )
        .join("");
      extraSectionHtml = `
        <div class="${CARD_CLASSES} p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Réservations</h2>
            <button id="booking-btn" class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">Nouvelle réservation</button>
          </div>
          ${
            bookings.length
              ? `<div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                   <table class="w-full">
                     <thead class="bg-slate-50 dark:bg-slate-800/60"><tr>
                       <th class="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Client</th>
                       <th class="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Séjour</th>
                       <th class="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Nuits</th>
                       <th class="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Total</th>
                       <th class="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Payé</th>
                       <th class="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Statut</th>
                     </tr></thead>
                     <tbody>${rows}</tbody>
                   </table>
                 </div>`
              : `<p class="text-sm text-slate-500 dark:text-slate-400">Aucune réservation.</p>`
          }
        </div>
      `;
    }

    content.innerHTML = `
      <a href="/admin/listings" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour aux annonces</a>
      <div class="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${current.properties ? `${current.properties.reference} — ${current.properties.city}` : "—"}</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400">${LISTING_TYPE_LABELS[current.listing_type] ?? current.listing_type}</p>
        </div>
        ${statusBadge(current.status, LISTING_STATUS_LABELS[current.status] ?? current.status)}
      </div>

      <div class="grid md:grid-cols-3 gap-6">
        <div class="md:col-span-2 space-y-6">
          ${extraSectionHtml}
        </div>

        <div class="${CARD_CLASSES} p-6 h-fit">
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Statut de l'annonce</label>
          <select id="status-select" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${statusOptions}</select>
          <p id="status-error" class="text-xs text-red-600 dark:text-red-400 mt-2 hidden"></p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-3">Créée le ${new Date(current.created_at).toLocaleDateString("fr-FR")}</p>
        </div>
      </div>
    `;

    content.querySelector<HTMLSelectElement>("#status-select")!.addEventListener("change", async (e) => {
      const newStatus = (e.target as HTMLSelectElement).value;
      const errorEl = content.querySelector<HTMLParagraphElement>("#status-error")!;
      errorEl.classList.add("hidden");
      const { error } = await supabase.from("listings").update({ status: newStatus }).eq("id", current.id);
      if (error) {
        errorEl.textContent = error.message.includes("RELIST_BLOCKED")
          ? "Ce bien a une vente déjà finalisée. Créez une nouvelle annonce via réactivation explicite plutôt que de réactiver celle-ci."
          : error.message;
        errorEl.classList.remove("hidden");
        (e.target as HTMLSelectElement).value = current.status;
        return;
      }
      showToast("Statut mis à jour");
      draw();
    });

    content.querySelector<HTMLButtonElement>("#sale-btn")?.addEventListener("click", async () => {
      const sale = await fetchSale(current.id);
      openSaleModal(current, sale, draw);
    });

    content.querySelector<HTMLButtonElement>("#booking-btn")?.addEventListener("click", () => {
      openBookingModal(current, draw);
    });
  }

  await draw();
}
