import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { MaintenanceRequest } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal, closeModal, modalBody } from "../../components/modal";
import { statusBadge, statusLabel } from "../../components/status-badge";
import { showToast } from "../../components/toast";
import { navigate } from "../../router";
import { fetchPropertyOptions } from "./leases";
import { MAINTENANCE_PRIORITY_LABELS } from "../../lib/status-labels";

export const PRIORITY_LABELS = MAINTENANCE_PRIORITY_LABELS;

const PRIORITY_DOTS: Record<string, string> = {
  low: "bg-slate-400",
  normal: "bg-blue-500",
  high: "bg-amber-500",
  urgent: "bg-red-500",
};

export function priorityBadge(priority: string): string {
  const dot = PRIORITY_DOTS[priority] ?? "bg-slate-400";
  return `<span class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"><span class="w-1.5 h-1.5 rounded-full ${dot} shrink-0"></span>${PRIORITY_LABELS[priority] ?? priority}</span>`;
}

type MaintenanceRow = MaintenanceRequest & {
  properties: { reference: string; city: string } | null;
  profiles: { full_name: string } | null;
};

async function fetchMaintenanceRequests(): Promise<MaintenanceRow[]> {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("*, properties(reference, city), profiles:reported_by(full_name)")
    .order("created_at", { ascending: false });
  if (error) {
    showToast("Erreur de chargement des demandes", "error");
    return [];
  }
  return data as unknown as MaintenanceRow[];
}

async function openNewTicketModal(organizationId: string, reportedBy: string, onSaved: () => void) {
  const properties = await fetchPropertyOptions();
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

    const { error } = await supabase.from("maintenance_requests").insert({
      organization_id: organizationId,
      property_id: propertyId,
      reported_by: reportedBy,
      title: String(fd.get("title")).trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      priority: String(fd.get("priority")),
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    closeModal();
    showToast("Demande créée");
    onSaved();
  });
}

export async function renderAdminMaintenance() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const reportedBy = profile.id;
  const content = renderPortalShell(profile, "/admin/maintenance");
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
    const tickets = await fetchMaintenanceRequests();
    renderDataTable(tableEl, {
      rows: tickets,
      emptyMessage: "Aucune demande d'intervention.",
      onRowClick: (t) => navigate(`/admin/maintenance/${t.id}`),
      columns: [
        { label: "Bien", render: (t) => (t.properties ? `${t.properties.reference} — ${t.properties.city}` : "—") },
        { label: "Titre", render: (t) => t.title },
        { label: "Signalé par", render: (t) => t.profiles?.full_name ?? "—" },
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
