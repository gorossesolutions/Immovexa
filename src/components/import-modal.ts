import { supabase } from "../lib/supabase";
import { openModal, closeModal, modalBody } from "./modal";
import { showToast } from "./toast";
import { parseCsv, downloadCsv } from "../lib/csv";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[\d+() ]*$/;

interface ParsedRow {
  full_name: string;
  email: string;
  phone: string | null;
  errors: string[];
}

function validateRow(cells: string[]): ParsedRow {
  const full_name = (cells[0] ?? "").trim();
  const email = (cells[1] ?? "").trim();
  const phone = (cells[2] ?? "").trim();
  const errors: string[] = [];

  if (!full_name) errors.push("Nom manquant");
  if (!email) errors.push("Email manquant");
  else if (!EMAIL_PATTERN.test(email)) errors.push("Email invalide");
  if (phone && !PHONE_PATTERN.test(phone)) errors.push("Téléphone : chiffres, +, ( ) uniquement");

  return { full_name, email, phone: phone || null, errors };
}

function previewTableHtml(rows: ParsedRow[]): string {
  return `
    <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-80 overflow-y-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
          <tr>
            <th class="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Nom</th>
            <th class="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Email</th>
            <th class="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Téléphone</th>
            <th class="text-left px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr class="border-t border-slate-100 dark:border-slate-800">
              <td class="px-3 py-2 text-slate-700 dark:text-slate-300">${r.full_name || "—"}</td>
              <td class="px-3 py-2 text-slate-700 dark:text-slate-300">${r.email || "—"}</td>
              <td class="px-3 py-2 text-slate-700 dark:text-slate-300">${r.phone ?? "—"}</td>
              <td class="px-3 py-2">
                ${
                  r.errors.length === 0
                    ? `<span class="text-emerald-600 dark:text-emerald-400">✓ Valide</span>`
                    : `<span class="text-red-600 dark:text-red-400">✗ ${r.errors.join(", ")}</span>`
                }
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function openImportModal(role: "owner" | "tenant", roleLabel: string, onDone: () => void) {
  openModal(
    `Importer des ${roleLabel}`,
    `
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Importez plusieurs ${roleLabel} d'un coup via un fichier CSV. Téléchargez le modèle pour être sûr du bon format.
      </p>
      <div class="flex items-center gap-3 mb-4">
        <button id="download-template" class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">Télécharger le modèle CSV</button>
      </div>
      <label class="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg px-4 py-6 text-center cursor-pointer hover:border-secondary transition mb-4">
        <span class="text-sm text-slate-500 dark:text-slate-400" id="csv-file-label">Cliquer pour choisir un fichier CSV</span>
        <input id="csv-file-input" type="file" accept=".csv,text/csv" class="hidden" />
      </label>
      <div id="preview-area"></div>
      <p id="import-error" class="text-sm text-red-600 dark:text-red-400 hidden mt-3"></p>
      <div class="flex justify-end gap-3 pt-4">
        <button type="button" id="cancel-import" class="text-sm text-slate-500 dark:text-slate-400 hover:underline">Fermer</button>
        <button type="button" id="submit-import" disabled
          class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
          Importer
        </button>
      </div>
    `,
    { size: "xl" }
  );

  const fileInput = modalBody().querySelector<HTMLInputElement>("#csv-file-input")!;
  const fileLabel = modalBody().querySelector<HTMLSpanElement>("#csv-file-label")!;
  const previewArea = modalBody().querySelector<HTMLDivElement>("#preview-area")!;
  const errorEl = modalBody().querySelector<HTMLParagraphElement>("#import-error")!;
  const submitBtn = modalBody().querySelector<HTMLButtonElement>("#submit-import")!;

  modalBody().querySelector<HTMLButtonElement>("#cancel-import")!.addEventListener("click", closeModal);

  modalBody().querySelector<HTMLButtonElement>("#download-template")!.addEventListener("click", () => {
    downloadCsv(`modele-import-${role === "owner" ? "proprietaires" : "locataires"}.csv`, [
      ["Nom complet", "Email", "Téléphone"],
      ["Jean Dupont", "jean.dupont@example.mu", "+230 5123 4567"],
    ]);
  });

  let validRows: ParsedRow[] = [];

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileLabel.textContent = file.name;
    errorEl.classList.add("hidden");

    const text = await file.text();
    const allRows = parseCsv(text);
    const dataRows = allRows.slice(1); // ignore la ligne d'en-tête

    if (dataRows.length === 0) {
      errorEl.textContent = "Aucune ligne de données trouvée dans le fichier.";
      errorEl.classList.remove("hidden");
      previewArea.innerHTML = "";
      submitBtn.disabled = true;
      return;
    }

    const parsed = dataRows.map(validateRow);
    validRows = parsed.filter((r) => r.errors.length === 0);

    previewArea.innerHTML = previewTableHtml(parsed);
    submitBtn.textContent = `Importer ${validRows.length} ligne(s) valide(s)`;
    submitBtn.disabled = validRows.length === 0;
  });

  submitBtn.addEventListener("click", async () => {
    errorEl.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.textContent = "Import en cours…";

    const { data, error } = await supabase.functions.invoke("import-users", {
      body: { role, rows: validRows.map((r) => ({ full_name: r.full_name, email: r.email, phone: r.phone })) },
    });

    if (error) {
      errorEl.textContent = error.message ?? "Erreur lors de l'import.";
      errorEl.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = `Importer ${validRows.length} ligne(s) valide(s)`;
      return;
    }

    const results = (data?.results ?? []) as { email: string; status: "created" | "error"; message?: string }[];
    const created = results.filter((r) => r.status === "created").length;
    const failed = results.filter((r) => r.status === "error");

    if (failed.length > 0) {
      previewArea.innerHTML = `
        <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table class="w-full text-sm">
            <tbody>
              ${results
                .map(
                  (r) => `
                <tr class="border-t border-slate-100 dark:border-slate-800">
                  <td class="px-3 py-2 text-slate-700 dark:text-slate-300">${r.email}</td>
                  <td class="px-3 py-2">${r.status === "created" ? `<span class="text-emerald-600 dark:text-emerald-400">✓ Créé</span>` : `<span class="text-red-600 dark:text-red-400">✗ ${r.message}</span>`}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    showToast(`${created} ${roleLabel} importé(s)${failed.length ? `, ${failed.length} échec(s)` : ""}`, failed.length ? "error" : "success");
    submitBtn.classList.add("hidden");
    onDone();
  });
}
