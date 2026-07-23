import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { MaintenanceRequest } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge, statusLabel } from "../../components/status-badge";
import { CARD_CLASSES } from "../../components/detail-table";
import { showToast } from "../../components/toast";
import { PRIORITY_LABELS, priorityBadge } from "./maintenance";

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

type MaintenanceDetail = MaintenanceRequest & {
  properties: { reference: string; city: string } | null;
  profiles: { full_name: string } | null;
};

async function fetchTicket(id: string): Promise<MaintenanceDetail | null> {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("*, properties(reference, city), profiles:reported_by(full_name)")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as unknown as MaintenanceDetail;
}

async function fetchConversationId(maintenanceRequestId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("linked_entity_type", "maintenance_request")
    .eq("linked_entity_id", maintenanceRequestId)
    .single();
  if (error || !data) return null;
  return data.id;
}

async function fetchComments(conversationId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, body, created_at, profiles:author_id(full_name)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data as unknown as CommentRow[];
}

export async function renderAdminMaintenanceDetail(params: Record<string, string>) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const currentProfileId = profile.id;
  const content = renderPortalShell(profile, "/admin/maintenance");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const ticket = await fetchTicket(params.id);
  if (!ticket) {
    content.innerHTML = `<p class="text-sm text-red-600">Demande introuvable.</p>`;
    return;
  }

  async function draw() {
    const current = await fetchTicket(params.id);
    if (!current) {
      content.innerHTML = `<p class="text-sm text-red-600">Demande introuvable.</p>`;
      return;
    }
    const conversationId = await fetchConversationId(current.id);
    const comments = conversationId ? await fetchComments(conversationId) : [];

    const statusOptions = ["open", "in_progress", "resolved", "closed"]
      .map((s) => `<option value="${s}" ${current.status === s ? "selected" : ""}>${statusLabel(s)}</option>`)
      .join("");

    const commentsHtml = comments
      .map(
        (c) => `
        <div class="py-3 border-b border-slate-200 dark:border-slate-800 last:border-0">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-slate-900 dark:text-slate-100">${c.profiles?.full_name ?? "—"}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400">${new Date(c.created_at).toLocaleString("fr-FR")}</span>
          </div>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">${c.body}</p>
        </div>`
      )
      .join("");

    content.innerHTML = `
      <a href="/admin/maintenance" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour à la maintenance</a>
      <div class="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${current.title}</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400">${current.properties ? `${current.properties.reference} — ${current.properties.city}` : "—"} · Signalé par ${current.profiles?.full_name ?? "—"}</p>
        </div>
        <div class="flex items-center gap-3">
          ${priorityBadge(current.priority)}
          ${statusBadge(current.status)}
        </div>
      </div>

      <div class="grid md:grid-cols-3 gap-6">
        <div class="md:col-span-2 ${CARD_CLASSES} p-6">
          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Description</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">${current.description ?? "Aucune description."}</p>

          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Commentaires</h2>
          <div id="comments-list">${commentsHtml || '<p class="text-sm text-slate-500 dark:text-slate-400 py-2">Aucun commentaire.</p>'}</div>

          <form id="comment-form" class="flex items-start gap-2 mt-4">
            <textarea name="message" rows="2" required placeholder="Ajouter un commentaire…"
              class="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm"></textarea>
            <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">Envoyer</button>
          </form>
        </div>

        <div class="${CARD_CLASSES} p-6 h-fit">
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Statut</label>
          <select id="status-select" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${statusOptions}</select>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Priorité : ${PRIORITY_LABELS[current.priority] ?? current.priority}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Créée le ${new Date(current.created_at).toLocaleDateString("fr-FR")}</p>
          ${current.resolved_at ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Résolue le ${new Date(current.resolved_at).toLocaleDateString("fr-FR")}</p>` : ""}
        </div>
      </div>
    `;

    content.querySelector<HTMLSelectElement>("#status-select")!.addEventListener("change", async (e) => {
      const newStatus = (e.target as HTMLSelectElement).value;
      const resolvedAt = newStatus === "resolved" || newStatus === "closed" ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("maintenance_requests")
        .update({ status: newStatus, resolved_at: resolvedAt })
        .eq("id", current.id);
      if (error) {
        showToast("Erreur lors de la mise à jour", "error");
        return;
      }
      showToast("Statut mis à jour");
      draw();
    });

    content.querySelector<HTMLFormElement>("#comment-form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const fd = new FormData(form);
      const body = String(fd.get("message") ?? "").trim();
      if (!body || !conversationId) return;

      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, author_id: currentProfileId, body });

      if (error) {
        showToast("Erreur lors de l'envoi", "error");
        return;
      }
      draw();
    });
  }

  await draw();
}
