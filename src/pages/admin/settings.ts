import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import { applyBranding } from "../../lib/theme";
import type { BrandingSettings } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { CARD_CLASSES } from "../../components/detail-table";
import { renderFileUpload } from "../../components/file-upload";
import { showToast } from "../../components/toast";

const FONT_OPTIONS = ["Inter", "DM Sans", "Manrope", "Poppins"];

interface ColorPreset {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
}

const COLOR_PRESETS: ColorPreset[] = [
  { name: "Bleu Corporate", primary: "#0f172a", secondary: "#0067ff", accent: "#e7f6ff", neutral: "#364151" },
  { name: "Émeraude Confiance", primary: "#0f2e1d", secondary: "#059669", accent: "#d1fae5", neutral: "#374151" },
  { name: "Terracotta Premium", primary: "#2d2420", secondary: "#c9917a", accent: "#faf8f5", neutral: "#57534e" },
  { name: "Anthracite Minimal", primary: "#18181b", secondary: "#6366f1", accent: "#eef2ff", neutral: "#3f3f46" },
  { name: "Bleu Marine Classique", primary: "#0c1e3d", secondary: "#1d4ed8", accent: "#dbeafe", neutral: "#334155" },
];

async function fetchBranding(organizationId: string): Promise<BrandingSettings | null> {
  const { data, error } = await supabase
    .from("branding_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .single();
  if (error || !data) return null;
  return data as BrandingSettings;
}

export async function renderAdminSettings() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin/settings");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const branding = await fetchBranding(organizationId);
  if (!branding) {
    content.innerHTML = `<p class="text-sm text-red-600">Paramètres de marque introuvables.</p>`;
    return;
  }

  const fontOptions = FONT_OPTIONS.map((f) => `<option value="${f}" ${branding.font_family === f ? "selected" : ""}>${f}</option>`).join("");

  content.innerHTML = `
    <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Paramètres</h1>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Marque blanche — ces réglages s'appliquent à toute l'organisation, sans toucher au code.</p>

    <form id="branding-form" class="max-w-xl space-y-6 ${CARD_CLASSES} p-6">
      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Nom affiché *</label>
        <input name="display_name" required value="${branding.display_name}"
          class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm" />
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Logo</label>
        ${branding.logo_url ? `<img src="${branding.logo_url}" alt="Logo actuel" class="h-12 mb-2 object-contain" />` : ""}
        <div id="logo-upload-zone"></div>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-2">Presets rapides</label>
        <div class="flex flex-wrap gap-2">
          ${COLOR_PRESETS.map(
            (p, i) => `
            <button type="button" data-preset-index="${i}" title="${p.name}"
              class="flex flex-col items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 hover:border-secondary transition-colors">
              <span class="flex gap-1">
                <span class="w-3 h-3 rounded-full border border-black/10" style="background:${p.primary}"></span>
                <span class="w-3 h-3 rounded-full border border-black/10" style="background:${p.secondary}"></span>
                <span class="w-3 h-3 rounded-full border border-black/10" style="background:${p.accent}"></span>
                <span class="w-3 h-3 rounded-full border border-black/10" style="background:${p.neutral}"></span>
              </span>
              <span class="text-[11px] text-slate-600 dark:text-slate-400">${p.name}</span>
            </button>`
          ).join("")}
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Couleur primaire</label>
          <input name="primary_color" type="color" value="${branding.primary_color}" class="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Couleur secondaire</label>
          <input name="secondary_color" type="color" value="${branding.secondary_color}" class="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Couleur accent</label>
          <input name="accent_color" type="color" value="${branding.accent_color}" class="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700" />
        </div>
        <div>
          <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Couleur neutre</label>
          <input name="neutral_color" type="color" value="${branding.neutral_color}" class="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700" />
        </div>
      </div>

      <div>
        <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1">Police</label>
        <select name="font_family" class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm">${fontOptions}</select>
      </div>

      <p id="form-error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>

      <div class="flex justify-end">
        <button type="submit" id="save-btn" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-60">
          Enregistrer
        </button>
      </div>
    </form>
  `;

  let logoFile: File | null = null;
  renderFileUpload(content.querySelector<HTMLDivElement>("#logo-upload-zone")!, {
    accept: "image/*",
    onChange: (file) => (logoFile = file),
  });

  const form = content.querySelector<HTMLFormElement>("#branding-form")!;
  const errorEl = content.querySelector<HTMLParagraphElement>("#form-error")!;
  const saveBtn = content.querySelector<HTMLButtonElement>("#save-btn")!;

  content.querySelectorAll<HTMLButtonElement>("button[data-preset-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = COLOR_PRESETS[Number(btn.dataset.presetIndex)];
      (form.elements.namedItem("primary_color") as HTMLInputElement).value = preset.primary;
      (form.elements.namedItem("secondary_color") as HTMLInputElement).value = preset.secondary;
      (form.elements.namedItem("accent_color") as HTMLInputElement).value = preset.accent;
      (form.elements.namedItem("neutral_color") as HTMLInputElement).value = preset.neutral;
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    saveBtn.disabled = true;

    const fd = new FormData(form);
    let logoUrl = branding.logo_url;

    if (logoFile) {
      const path = `${organizationId}/logo.png`;
      const { error: uploadError } = await supabase.storage.from("branding").upload(path, logoFile, { upsert: true });
      if (uploadError) {
        saveBtn.disabled = false;
        errorEl.textContent = uploadError.message;
        errorEl.classList.remove("hidden");
        return;
      }
      logoUrl = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase
      .from("branding_settings")
      .update({
        display_name: String(fd.get("display_name")).trim(),
        logo_url: logoUrl,
        primary_color: String(fd.get("primary_color")),
        secondary_color: String(fd.get("secondary_color")),
        accent_color: String(fd.get("accent_color")),
        neutral_color: String(fd.get("neutral_color")),
        font_family: String(fd.get("font_family")),
      })
      .eq("organization_id", organizationId);

    saveBtn.disabled = false;

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    await applyBranding(organizationId);
    showToast("Paramètres enregistrés");
  });
}
