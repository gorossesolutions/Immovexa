import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { DocumentEntityType, DocumentRow } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { renderFileUpload } from "../../components/file-upload";
import { showToast } from "../../components/toast";
import { fetchOwners } from "./properties";
import { fetchPropertyOptions, fetchTenantOptions } from "./leases";

export const ENTITY_TYPE_LABELS: Record<DocumentEntityType, string> = {
  property: "Bien",
  lease: "Location",
  payment: "Paiement",
  tenant: "Locataire",
  owner: "Propriétaire",
  maintenance: "Maintenance",
  organization: "Organisation",
};

export const CATEGORY_LABELS: Record<string, string> = {
  lease_contract: "Contrat de bail",
  id_document: "Pièce d'identité",
  inventory_checkin: "État des lieux entrée",
  inventory_checkout: "État des lieux sortie",
  receipt: "Quittance",
  invoice: "Facture",
  diagnostic: "Diagnostic",
  insurance: "Assurance",
  other: "Autre",
};

const VISIBILITY_LABELS: Record<string, string> = {
  admin_only: "Admin uniquement",
  owner_shared: "Partagé propriétaire",
  tenant_shared: "Partagé locataire",
  shared: "Partagé (tous)",
};

interface EntityOption {
  id: string;
  label: string;
}

async function fetchLeaseEntityOptions(): Promise<EntityOption[]> {
  const { data, error } = await supabase
    .from("leases")
    .select("id, start_date, properties(reference, city)")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as any[]).map((l) => ({
    id: l.id,
    label: l.properties ? `${l.properties.reference} — ${l.properties.city} (${l.start_date})` : l.id,
  }));
}

async function fetchPaymentEntityOptions(): Promise<EntityOption[]> {
  const { data: payments, error } = await supabase
    .from("payments")
    .select("id, payment_date, billing_account_id")
    .order("payment_date", { ascending: false });
  if (error || !payments || payments.length === 0) return [];

  const { data: accounts } = await supabase
    .from("billing_accounts")
    .select("id, owner_entity_id")
    .eq("owner_entity_type", "lease")
    .in("id", payments.map((p) => p.billing_account_id));

  const leaseIdByAccount = new Map((accounts ?? []).map((a) => [a.id, a.owner_entity_id]));
  const leaseIds = [...new Set(leaseIdByAccount.values())];

  const { data: leases } = leaseIds.length
    ? await supabase.from("leases").select("id, properties(reference)").in("id", leaseIds)
    : { data: [] as any[] };

  const propertyRefByLease = new Map((leases as any[] ?? []).map((l) => [l.id, l.properties?.reference]));

  return payments.map((p) => {
    const leaseId = leaseIdByAccount.get(p.billing_account_id);
    const propertyRef = leaseId ? propertyRefByLease.get(leaseId) : null;
    return {
      id: p.id,
      label: propertyRef ? `${propertyRef} — ${p.payment_date}` : p.payment_date,
    };
  });
}

async function fetchMaintenanceEntityOptions(): Promise<EntityOption[]> {
  const { data, error } = await supabase.from("maintenance_requests").select("id, title").order("created_at", { ascending: false });
  if (error) return [];
  return (data as any[]).map((m) => ({ id: m.id, label: m.title }));
}

async function fetchEntityOptions(entityType: DocumentEntityType, organizationId: string): Promise<EntityOption[]> {
  switch (entityType) {
    case "property":
      return (await fetchPropertyOptions()).map((p) => ({ id: p.id, label: `${p.reference} — ${p.city}` }));
    case "lease":
      return fetchLeaseEntityOptions();
    case "payment":
      return fetchPaymentEntityOptions();
    case "tenant":
      return (await fetchTenantOptions()).map((t) => ({ id: t.id, label: t.full_name }));
    case "owner":
      return (await fetchOwners()).map((o) => ({ id: o.id, label: o.full_name }));
    case "maintenance":
      return fetchMaintenanceEntityOptions();
    case "organization":
      return [{ id: organizationId, label: "Organisation" }];
  }
}

async function fetchDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
  if (error) {
    showToast("Erreur de chargement des documents", "error");
    return [];
  }
  return data as DocumentRow[];
}

async function openUploadModal(organizationId: string, uploadedBy: string, onSaved: () => void) {
  const entityTypeOptions = Object.entries(ENTITY_TYPE_LABELS)
    .map(([v, l]) => `<option value="${v}">${l}</option>`)
    .join("");
  const categoryOptions = Object.entries(CATEGORY_LABELS)
    .map(([v, l]) => `<option value="${v}">${l}</option>`)
    .join("");
  const visibilityOptions = Object.entries(VISIBILITY_LABELS)
    .map(([v, l]) => `<option value="${v}" ${v === "shared" ? "selected" : ""}>${l}</option>`)
    .join("");

  openModal(
    "Ajouter un document",
    `
      <form id="doc-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Type d'entité *</label>
            <select name="entity_type" id="entity-type-select" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${entityTypeOptions}</select>
          </div>
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Entité *</label>
            <select name="entity_id" id="entity-id-select" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
              <option value="">Chargement…</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Catégorie *</label>
            <select name="category" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${categoryOptions}</select>
          </div>
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Visibilité</label>
            <select name="visibility" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${visibilityOptions}</select>
          </div>
        </div>

        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Fichier *</label>
          <div id="file-upload-zone"></div>
        </div>

        <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>

        <div class="flex justify-end gap-3 pt-2">
          <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
          <button type="submit" id="submit-btn" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60">
            Envoyer
          </button>
        </div>
      </form>
    `
  );

  const form = modalBody().querySelector<HTMLFormElement>("#doc-form")!;
  const entityTypeSelect = modalBody().querySelector<HTMLSelectElement>("#entity-type-select")!;
  const entityIdSelect = modalBody().querySelector<HTMLSelectElement>("#entity-id-select")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  const submitBtn = modalBody().querySelector<HTMLButtonElement>("#submit-btn")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  let selectedFile: File | null = null;
  renderFileUpload(modalBody().querySelector<HTMLDivElement>("#file-upload-zone")!, {
    onChange: (file) => (selectedFile = file),
  });

  async function populateEntities() {
    entityIdSelect.innerHTML = `<option value="">Chargement…</option>`;
    const options = await fetchEntityOptions(entityTypeSelect.value as DocumentEntityType, organizationId);
    entityIdSelect.innerHTML =
      `<option value="">Sélectionner…</option>` + options.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  }

  entityTypeSelect.addEventListener("change", populateEntities);
  await populateEntities();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const fd = new FormData(form);
    const entityType = String(fd.get("entity_type")) as DocumentEntityType;
    const entityId = String(fd.get("entity_id"));
    const category = String(fd.get("category"));
    const visibility = String(fd.get("visibility"));

    if (!entityId) {
      errorEl.textContent = "Sélectionnez une entité.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (!selectedFile) {
      errorEl.textContent = "Choisissez un fichier.";
      errorEl.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    const path = `${organizationId}/${entityType}/${entityId}/${Date.now()}_${selectedFile.name}`;

    const { error: uploadError } = await supabase.storage.from("documents").upload(path, selectedFile);
    if (uploadError) {
      submitBtn.disabled = false;
      errorEl.textContent = uploadError.message;
      errorEl.classList.remove("hidden");
      return;
    }

    const { error: insertError } = await supabase.from("documents").insert({
      organization_id: organizationId,
      entity_type: entityType,
      entity_id: entityId,
      category,
      file_name: selectedFile.name,
      file_path: path,
      file_size: selectedFile.size,
      mime_type: selectedFile.type || null,
      uploaded_by: uploadedBy,
      visibility,
    });

    if (insertError) {
      await supabase.storage.from("documents").remove([path]);
      submitBtn.disabled = false;
      errorEl.textContent = insertError.message;
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast("Document ajouté");
    onSaved();
  });
}

async function openEditDocumentModal(doc: DocumentRow, organizationId: string, onSaved: () => void) {
  const entityTypeOptions = Object.entries(ENTITY_TYPE_LABELS)
    .map(([v, l]) => `<option value="${v}" ${v === doc.entity_type ? "selected" : ""}>${l}</option>`)
    .join("");
  const categoryOptions = Object.entries(CATEGORY_LABELS)
    .map(([v, l]) => `<option value="${v}" ${v === doc.category ? "selected" : ""}>${l}</option>`)
    .join("");
  const visibilityOptions = Object.entries(VISIBILITY_LABELS)
    .map(([v, l]) => `<option value="${v}" ${v === doc.visibility ? "selected" : ""}>${l}</option>`)
    .join("");

  openModal(
    "Modifier le document",
    `
      <form id="doc-edit-form" class="space-y-4">
        <p class="text-sm text-slate-500 dark:text-slate-400">${doc.file_name}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Type d'entité *</label>
            <select name="entity_type" id="entity-type-select" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${entityTypeOptions}</select>
          </div>
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Entité *</label>
            <select name="entity_id" id="entity-id-select" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
              <option value="">Chargement…</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Catégorie *</label>
            <select name="category" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${categoryOptions}</select>
          </div>
          <div>
            <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Visibilité</label>
            <select name="visibility" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${visibilityOptions}</select>
          </div>
        </div>

        <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>

        <div class="flex justify-end gap-3 pt-2">
          <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
          <button type="submit" id="submit-btn" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60">
            Enregistrer
          </button>
        </div>
      </form>
    `
  );

  const form = modalBody().querySelector<HTMLFormElement>("#doc-edit-form")!;
  const entityTypeSelect = modalBody().querySelector<HTMLSelectElement>("#entity-type-select")!;
  const entityIdSelect = modalBody().querySelector<HTMLSelectElement>("#entity-id-select")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  const submitBtn = modalBody().querySelector<HTMLButtonElement>("#submit-btn")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  async function populateEntities(preselectId?: string) {
    entityIdSelect.innerHTML = `<option value="">Chargement…</option>`;
    const options = await fetchEntityOptions(entityTypeSelect.value as DocumentEntityType, organizationId);
    entityIdSelect.innerHTML =
      `<option value="">Sélectionner…</option>` +
      options.map((o) => `<option value="${o.id}" ${o.id === preselectId ? "selected" : ""}>${o.label}</option>`).join("");
  }

  entityTypeSelect.addEventListener("change", () => populateEntities());
  await populateEntities(doc.entity_id);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const fd = new FormData(form);
    const entityId = String(fd.get("entity_id"));

    if (!entityId) {
      errorEl.textContent = "Sélectionnez une entité.";
      errorEl.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;

    const { error } = await supabase
      .from("documents")
      .update({
        entity_type: String(fd.get("entity_type")) as DocumentEntityType,
        entity_id: entityId,
        category: String(fd.get("category")),
        visibility: String(fd.get("visibility")),
      })
      .eq("id", doc.id);

    submitBtn.disabled = false;

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast("Document mis à jour");
    onSaved();
  });
}

async function downloadDocument(doc: DocumentRow) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 60);
  if (error || !data) {
    showToast("Erreur lors de la génération du lien", "error");
    return;
  }
  window.open(data.signedUrl, "_blank");
}

async function previewDocument(doc: DocumentRow) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 300);
  if (error || !data) {
    showToast("Erreur lors de la génération du lien", "error");
    return;
  }
  openModal(
    doc.file_name,
    `<embed src="${data.signedUrl}" type="application/pdf" class="w-full h-[80vh] rounded-md border border-slate-200 dark:border-slate-800" />`,
    { size: "xl" }
  );
}

const EYE_ICON = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const PENCIL_ICON = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const DOWNLOAD_ICON = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';
const TRASH_ICON = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

async function confirmDeleteDocument(doc: DocumentRow, onDeleted: () => void) {
  openModal(
    "Supprimer le document",
    `
      <p class="text-sm text-slate-500 dark:text-slate-400">Supprimer <strong>${doc.file_name}</strong> ? Cette action est irréversible.</p>
      <div class="flex justify-end gap-3 pt-6">
        <button id="cancel-delete" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
        <button id="confirm-delete" class="rounded-md bg-danger text-white text-sm font-medium px-4 py-2 hover:opacity-90">Supprimer</button>
      </div>
    `
  );

  modalBody().querySelector<HTMLButtonElement>("#cancel-delete")!.addEventListener("click", closeModal);
  modalBody().querySelector<HTMLButtonElement>("#confirm-delete")!.addEventListener("click", async () => {
    await supabase.storage.from("documents").remove([doc.file_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    closeModal();
    if (error) {
      showToast("Erreur lors de la suppression", "error");
      return;
    }
    showToast("Document supprimé");
    onDeleted();
  });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export async function renderAdminDocuments() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const uploadedBy = profile.id;
  const content = renderPortalShell(profile, "/admin/documents");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Documents</h1>
      <button id="upload-doc" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
        Ajouter un document
      </button>
    </div>
    <div id="documents-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#documents-table")!;

  function draw(documents: DocumentRow[]) {
    renderDataTable(tableEl, {
      rows: documents,
      emptyMessage: "Aucun document.",
      emptyCta: { label: "Ajouter un document", onClick: () => content.querySelector<HTMLButtonElement>("#upload-doc")!.click() },
      columns: [
        { label: "Fichier", render: (d) => `<span class="font-medium">${d.file_name}</span>` },
        { label: "Entité", render: (d) => ENTITY_TYPE_LABELS[d.entity_type] },
        { label: "Catégorie", render: (d) => CATEGORY_LABELS[d.category] ?? d.category },
        { label: "Visibilité", render: (d) => VISIBILITY_LABELS[d.visibility] ?? d.visibility },
        { label: "Taille", render: (d) => formatSize(d.file_size) },
        { label: "Ajouté le", render: (d) => new Date(d.created_at).toLocaleDateString("fr-FR") },
      ],
      filters: [
        { key: "entity_type", label: "Entité", value: (d) => ENTITY_TYPE_LABELS[d.entity_type] ?? d.entity_type },
        { key: "category", label: "Catégorie", value: (d) => CATEGORY_LABELS[d.category] ?? d.category },
      ],
      actions: [
        { label: "Aperçu", icon: EYE_ICON, variant: "solid", onClick: previewDocument },
        { label: "Télécharger", icon: DOWNLOAD_ICON, variant: "solid", onClick: downloadDocument },
        { label: "Modifier", icon: PENCIL_ICON, variant: "solid", onClick: (d) => openEditDocumentModal(d, organizationId, refresh) },
        { label: "Supprimer", icon: TRASH_ICON, variant: "solid-danger", onClick: (d) => confirmDeleteDocument(d, refresh) },
      ],
    });
  }

  async function refresh() {
    const documents = await fetchDocuments();
    draw(documents);
  }

  content.querySelector<HTMLButtonElement>("#upload-doc")!.addEventListener("click", () => {
    openUploadModal(organizationId, uploadedBy, refresh);
  });

  await refresh();
}
