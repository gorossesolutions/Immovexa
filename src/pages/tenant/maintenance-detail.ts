import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { MaintenanceRequest } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge } from "../../components/status-badge";
import { CARD_CLASSES } from "../../components/detail-table";
import { showToast } from "../../components/toast";
import { priorityBadge } from "../admin/maintenance";

interface MessageRow {
  id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

type MaintenanceDetail = MaintenanceRequest & { properties: { reference: string; city: string } | null };

async function fetchTicket(id: string): Promise<MaintenanceDetail | null> {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("*, properties(reference, city)")
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

async function fetchMessages(conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, body, created_at, profiles:author_id(full_name)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data as unknown as MessageRow[];
}

export async function renderTenantMaintenanceDetail(params: Record<string, string>) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const currentProfileId = profile.id;
  const content = renderPortalShell(profile, "/tenant/maintenance");
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
    const messages = conversationId ? await fetchMessages(conversationId) : [];

    const messagesHtml = messages
      .map(
        (m) => `
        <div class="py-3 border-b border-slate-200 dark:border-slate-800 last:border-0">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-slate-900 dark:text-slate-100">${m.profiles?.full_name ?? "—"}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400">${new Date(m.created_at).toLocaleString("fr-FR")}</span>
          </div>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">${m.body}</p>
        </div>`
      )
      .join("");

    content.innerHTML = `
      <a href="/tenant/maintenance" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour à la maintenance</a>
      <div class="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${current.title}</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400">${current.properties ? `${current.properties.reference} — ${current.properties.city}` : "—"}</p>
        </div>
        <div class="flex items-center gap-3">
          ${priorityBadge(current.priority)}
          ${statusBadge(current.status)}
        </div>
      </div>

      <div class="${CARD_CLASSES} p-6">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Description</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">${current.description ?? "Aucune description."}</p>

        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Échanges</h2>
        <div id="messages-list">${messagesHtml || '<p class="text-sm text-slate-500 dark:text-slate-400 py-2">Aucun message.</p>'}</div>

        <form id="message-form" class="flex items-start gap-2 mt-4">
          <textarea name="body" rows="2" required placeholder="Ajouter un message…"
            class="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-sm"></textarea>
          <button type="submit" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">Envoyer</button>
        </form>
      </div>
    `;

    content.querySelector<HTMLFormElement>("#message-form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const fd = new FormData(form);
      const body = String(fd.get("body") ?? "").trim();
      if (!body || !conversationId) return;

      const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, author_id: currentProfileId, body });

      if (error) {
        showToast("Erreur lors de l'envoi", "error");
        return;
      }
      draw();
    });
  }

  await draw();
}
