import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { AddressBookContact, ContactCategory } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { showToast } from "../../components/toast";
import { PENCIL_ICON, TRASH_ICON } from "../../components/icons";

export const CATEGORY_LABELS: Record<ContactCategory, string> = {
  plumber: "Plombier",
  electrician: "Électricien",
  locksmith: "Serrurier",
  cleaner: "Entretien / Ménage",
  gardener: "Jardinier",
  painter: "Peintre",
  general_contractor: "Entrepreneur général",
  concierge: "Concierge",
  notary: "Notaire",
  land_surveyor: "Géomètre",
  lawyer: "Avocat",
  insurance_agent: "Agent d'assurance",
  other: "Autre",
};

function insuranceBadge(expiry: string | null): string {
  if (!expiry) return "—";
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / (24 * 3600 * 1000));
  const dateLabel = new Date(expiry).toLocaleDateString("fr-FR");
  if (days < 0) {
    return `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-full px-2 py-0.5">Expirée le ${dateLabel}</span>`;
  }
  if (days <= 30) {
    return `<span class="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-full px-2 py-0.5">Expire le ${dateLabel}</span>`;
  }
  return `<span class="text-sm text-slate-700 dark:text-slate-300">${dateLabel}</span>`;
}

async function fetchContacts(): Promise<AddressBookContact[]> {
  const { data, error } = await supabase
    .from("address_book_contacts")
    .select("*")
    .order("full_name");
  if (error) {
    showToast("Erreur de chargement des prestataires", "error");
    return [];
  }
  return data as AddressBookContact[];
}

function contactFormHtml(contact?: AddressBookContact): string {
  const categoryOptions = Object.entries(CATEGORY_LABELS)
    .map(([value, label]) => `<option value="${value}" ${contact?.category === value ? "selected" : ""}>${label}</option>`)
    .join("");

  return `
    <form id="contact-form" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Catégorie *</label>
          <select name="category" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
            <option value="">Sélectionner…</option>${categoryOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Nom *</label>
          <input name="full_name" required value="${contact?.full_name ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Entreprise</label>
        <input name="company_name" value="${contact?.company_name ?? ""}"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Téléphone</label>
          <input name="phone" value="${contact?.phone ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Email</label>
          <input name="email" type="email" value="${contact?.email ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">N° de licence</label>
          <input name="license_number" value="${contact?.license_number ?? ""}"
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Expiration assurance</label>
          <input name="insurance_expiry" type="date" value="${contact?.insurance_expiry ?? ""}" ${contact && !contact.insurance_expiry ? "disabled" : ""}
            class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm disabled:opacity-50" />
          <label class="flex items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            <input type="checkbox" id="no-expiry-checkbox" ${contact && !contact.insurance_expiry ? "checked" : ""} />
            Jamais (pas de date de fin de contrat)
          </label>
        </div>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Notes</label>
        <textarea name="notes" rows="3"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${contact?.notes ?? ""}</textarea>
      </div>

      <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
          ${contact ? "Enregistrer" : "Ajouter le prestataire"}
        </button>
      </div>
    </form>
  `;
}

function readContactPayload(form: HTMLFormElement) {
  const fd = new FormData(form);
  const noExpiry = form.querySelector<HTMLInputElement>("#no-expiry-checkbox")!.checked;
  return {
    category: String(fd.get("category")),
    full_name: String(fd.get("full_name") ?? "").trim(),
    company_name: String(fd.get("company_name") ?? "").trim() || null,
    phone: String(fd.get("phone") ?? "").trim() || null,
    email: String(fd.get("email") ?? "").trim() || null,
    license_number: String(fd.get("license_number") ?? "").trim() || null,
    insurance_expiry: noExpiry ? null : String(fd.get("insurance_expiry") ?? "").trim() || null,
    notes: String(fd.get("notes") ?? "").trim() || null,
  };
}

function openContactModal(organizationId: string, onSaved: () => void, contact?: AddressBookContact) {
  openModal(contact ? `Modifier ${contact.full_name}` : "Nouveau prestataire", contactFormHtml(contact));

  const form = modalBody().querySelector<HTMLFormElement>("#contact-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  const dateInput = form.querySelector<HTMLInputElement>('input[name="insurance_expiry"]')!;
  const noExpiryCheckbox = form.querySelector<HTMLInputElement>("#no-expiry-checkbox")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  noExpiryCheckbox.addEventListener("change", () => {
    dateInput.disabled = noExpiryCheckbox.checked;
    if (noExpiryCheckbox.checked) dateInput.value = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const payload = readContactPayload(form);

    if (!payload.category) {
      errorEl.textContent = "Sélectionnez une catégorie.";
      errorEl.classList.remove("hidden");
      return;
    }

    const { error } = contact
      ? await supabase.from("address_book_contacts").update(payload).eq("id", contact.id)
      : await supabase.from("address_book_contacts").insert({ ...payload, organization_id: organizationId });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast(contact ? "Prestataire mis à jour" : "Prestataire ajouté");
    onSaved();
  });
}

function confirmDeleteContact(contact: AddressBookContact, onDeleted: () => void) {
  openModal(
    "Supprimer le prestataire",
    `
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Supprimer <strong>${contact.full_name}</strong> du carnet de prestataires ? Cette action est irréversible.
      </p>
      <div class="flex justify-end gap-3 pt-6">
        <button id="cancel-delete" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button id="confirm-delete" class="rounded-md bg-red-600 text-white text-sm font-medium px-4 py-2 hover:opacity-90">Supprimer</button>
      </div>
    `
  );

  modalBody().querySelector<HTMLButtonElement>("#cancel-delete")!.addEventListener("click", closeModal);
  modalBody().querySelector<HTMLButtonElement>("#confirm-delete")!.addEventListener("click", async () => {
    const { error } = await supabase.from("address_book_contacts").delete().eq("id", contact.id);
    closeModal();
    if (error) {
      showToast("Erreur lors de la suppression", "error");
      return;
    }
    showToast("Prestataire supprimé");
    onDeleted();
  });
}

export async function renderAdminContacts() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin/vendors");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Prestataires</h1>
      <button id="new-contact" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
        Nouveau prestataire
      </button>
    </div>
    <div id="contacts-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#contacts-table")!;

  async function refresh() {
    const contacts = await fetchContacts();
    renderDataTable(tableEl, {
      rows: contacts,
      emptyMessage: "Aucun prestataire enregistré.",
      emptyCta: { label: "Nouveau prestataire", onClick: () => content.querySelector<HTMLButtonElement>("#new-contact")!.click() },
      columns: [
        { label: "Nom", render: (c) => `<span class="font-medium">${c.full_name}</span>` },
        { label: "Catégorie", render: (c) => CATEGORY_LABELS[c.category] ?? c.category },
        { label: "Entreprise", render: (c) => c.company_name ?? "—" },
        { label: "Contact", render: (c) => [c.phone, c.email].filter(Boolean).join(" · ") || "—" },
        { label: "Assurance", render: (c) => insuranceBadge(c.insurance_expiry) },
      ],
      filters: [{ key: "category", label: "Catégorie", value: (c) => CATEGORY_LABELS[c.category] ?? c.category }],
      actions: [
        {
          label: "Modifier",
          icon: PENCIL_ICON,
          variant: "solid",
          onClick: (c) => openContactModal(organizationId, refresh, c),
        },
        {
          label: "Supprimer",
          icon: TRASH_ICON,
          variant: "solid-danger",
          onClick: (c) => confirmDeleteContact(c, refresh),
        },
      ],
    });
  }

  content.querySelector<HTMLButtonElement>("#new-contact")!.addEventListener("click", () => {
    openContactModal(organizationId, refresh);
  });

  await refresh();
}
