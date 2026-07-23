import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { MaintenanceRequest } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { statusBadge, statusLabel } from "../../components/status-badge";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";
import { renderFileUpload } from "../../components/file-upload";
import { PRIORITY_LABELS, priorityBadge } from "../admin/maintenance";

interface PropertyOption {
  id: string;
  reference: string;
  city: string;
}

type MaintenanceRow = MaintenanceRequest & { properties: { reference: string; city: string } | null };

async function fetchOwnTickets(): Promise<MaintenanceRow[]> {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("*, properties(reference, city)")
    .order("created_at", { ascending: false });
  if (error) {
    showToast("Erreur de chargement des demandes", "error");
    return [];
  }
  return data as unknown as MaintenanceRow[];
}

// RLS (tenant_active_property_ids) scope déjà cette requête aux biens du
// locataire — pas besoin de filtrage client-side supplémentaire ici.
async function fetchOwnPropertyOptions(): Promise<PropertyOption[]> {
  const { data } = await supabase.from("properties").select("id, reference, city").order("reference");
  return (data as PropertyOption[] | null) ?? [];
}

async function openNewTicketModal(organizationId: string, reportedBy: string, onSaved: () => void) {
  const properties = await fetchOwnPropertyOptions();
  const propertyOptions = properties.map((p) => `<option value="${p.id}">${p.reference} — ${p.city}</option>`).join("");
  const priorityOptions = Object.entries(PRIORITY_LABELS)
    .map(([v, l]) => `<option value="${v}" ${v === "normal" ? "selected" : ""}>${l}</option>`)
    .join("");

  openModal(
    "Nouvelle demande d'intervention",
    `
      <form id="ticket-form" class="space-y-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Bien *</label>
          <select name="property_id" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">
            <option value="">Sélectionner…</option>${propertyOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Titre *</label>
          <input name="title" required class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Description</label>
          <textarea name="description" rows="3" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"></textarea>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Priorité</label>
          <select name="priority" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${priorityOptions}</select>
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Photo (facultatif)</label>
          <div id="photo-upload-zone"></div>
        </div>
        <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" id="cancel-btn" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Annuler</button>
          <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">Créer</button>
        </div>
      </form>
    `
  );

  const form = modalBody().querySelector<HTMLFormElement>("#ticket-form")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#form-error")!;
  modalBody().querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", closeModal);

  let photoFile: File | null = null;
  renderFileUpload(modalBody().querySelector<HTMLDivElement>("#photo-upload-zone")!, {
    accept: "image/*",
    capture: "environment",
    placeholder: "Prendre ou choisir une photo",
    onChange: (file) => (photoFile = file),
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const fd = new FormData(form);
    const propertyId = String(fd.get("property_id"));

    if (!propertyId) {
      errorEl.textContent = "Sélectionnez un bien.";
      errorEl.classList.remove("hidden");
      return;
    }

    const { data: ticket, error } = await supabase
      .from("maintenance_requests")
      .insert({
        organization_id: organizationId,
        property_id: propertyId,
        reported_by: reportedBy,
        title: String(fd.get("title")).trim(),
        description: String(fd.get("description") ?? "").trim() || null,
        priority: String(fd.get("priority")),
      })
      .select("id")
      .single();

    if (error || !ticket) {
      errorEl.textContent = error?.message ?? "Erreur inattendue.";
      errorEl.classList.remove("hidden");
      return;
    }

    if (photoFile) {
      const path = `${organizationId}/maintenance/${ticket.id}/${Date.now()}_${photoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, photoFile);
      if (!uploadError) {
        await supabase.from("documents").insert({
          organization_id: organizationId,
          entity_type: "maintenance",
          entity_id: ticket.id,
          category: "other",
          file_name: photoFile.name,
          file_path: path,
          file_size: photoFile.size,
          mime_type: photoFile.type || null,
          uploaded_by: reportedBy,
          visibility: "shared",
        });
      }
    }

    closeModal();
    showToast("Demande créée");
    onSaved();
  });
}

export async function renderTenantMaintenance() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const reportedBy = profile.id;
  const content = renderPortalShell(profile, "/tenant/maintenance");
  content.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Maintenance</h1>
      <button id="new-ticket" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">
        Nouvelle demande
      </button>
    </div>
    <div id="tickets-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#tickets-table")!;

  async function refresh() {
    const tickets = await fetchOwnTickets();
    renderDataTable(tableEl, {
      rows: tickets,
      emptyMessage: "Aucune demande d'intervention.",
      onRowClick: (t) => navigate(`/tenant/maintenance/${t.id}`),
      columns: [
        { label: "Bien", render: (t) => (t.properties ? `${t.properties.reference} — ${t.properties.city}` : "—") },
        { label: "Titre", render: (t) => t.title },
        { label: "Priorité", render: (t) => priorityBadge(t.priority) },
        { label: "Statut", render: (t) => statusBadge(t.status) },
        { label: "Créée le", render: (t) => new Date(t.created_at).toLocaleDateString("fr-FR") },
      ],
      filters: [
        { key: "status", label: "Statut", value: (t) => statusLabel(t.status) },
        { key: "priority", label: "Priorité", value: (t) => PRIORITY_LABELS[t.priority] ?? t.priority },
      ],
    });
  }

  content.querySelector<HTMLButtonElement>("#new-ticket")!.addEventListener("click", () => {
    openNewTicketModal(organizationId, reportedBy, refresh);
  });

  await refresh();
}
