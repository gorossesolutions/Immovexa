import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { DocumentRow } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { openModal } from "../../components/modal";
import { showToast } from "../../components/toast";
import { ENTITY_TYPE_LABELS, CATEGORY_LABELS } from "../admin/documents";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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
const DOWNLOAD_ICON = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';

// Même principe que owner/documents.ts : la RLS ne filtre `documents` que par
// visibilité + organisation, le filtrage fin par entity_id se fait ici.
async function fetchTenantDocuments(tenantId: string): Promise<DocumentRow[]> {
  const [{ data: docs, error }, { data: properties }, { data: leases }, { data: maintenance }] = await Promise.all([
    supabase.from("documents").select("*").order("created_at", { ascending: false }),
    supabase.from("properties").select("id"),
    supabase.from("leases").select("id"),
    supabase.from("maintenance_requests").select("id"),
  ]);

  if (error) {
    showToast("Erreur de chargement des documents", "error");
    return [];
  }

  const ownPropertyIds = new Set((properties ?? []).map((p) => p.id));
  const ownLeaseIds = new Set((leases ?? []).map((l) => l.id));
  const ownMaintenanceIds = new Set((maintenance ?? []).map((m) => m.id));

  return (docs as DocumentRow[]).filter((d) => {
    switch (d.entity_type) {
      case "property":
        return ownPropertyIds.has(d.entity_id);
      case "lease":
        return ownLeaseIds.has(d.entity_id);
      case "maintenance":
        return ownMaintenanceIds.has(d.entity_id);
      case "tenant":
        return d.entity_id === tenantId;
      case "organization":
        return true;
      default:
        return false;
    }
  });
}

export async function renderTenantDocuments() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/tenant/documents");
  content.innerHTML = `
    <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Documents</h1>
    <div id="documents-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#documents-table")!;
  const documents = await fetchTenantDocuments(profile.id);

  renderDataTable(tableEl, {
    rows: documents,
    emptyMessage: "Aucun document.",
    columns: [
      { label: "Fichier", render: (d) => `<span class="font-medium">${d.file_name}</span>` },
      { label: "Entité", render: (d) => ENTITY_TYPE_LABELS[d.entity_type] },
      { label: "Catégorie", render: (d) => CATEGORY_LABELS[d.category] ?? d.category },
      { label: "Taille", render: (d) => formatSize(d.file_size) },
      { label: "Ajouté le", render: (d) => new Date(d.created_at).toLocaleDateString("fr-FR") },
    ],
    filters: [{ key: "category", label: "Catégorie", value: (d) => CATEGORY_LABELS[d.category] ?? d.category }],
    actions: [
      { label: "Aperçu", icon: EYE_ICON, variant: "solid", onClick: previewDocument },
      { label: "Télécharger", icon: DOWNLOAD_ICON, variant: "solid", onClick: downloadDocument },
    ],
  });
}
