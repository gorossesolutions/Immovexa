import { supabase } from "./supabase";

export interface BrandingInfo {
  displayName: string;
  logoUrl: string | null;
}

let currentBranding: BrandingInfo | null = null;

/** Synchronous read of the branding resolved by the last applyBranding()/bootBranding() call. */
export function getCurrentBranding(): BrandingInfo | null {
  return currentBranding;
}

const DARK_INK = "#0f172a";
const LIGHT_INK = "#ffffff";

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const bigint = parseInt(full, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const DARK_INK_LUMINANCE = relativeLuminance(DARK_INK);

/**
 * Un fond de marque peut être n'importe quelle couleur (color picker libre),
 * donc le texte posé dessus ne peut pas être du blanc figé : on choisit ici,
 * entre blanc et un encre sombre, celui qui offre le meilleur contraste WCAG.
 */
function pickInkColor(backgroundHex: string): string {
  const bgLuminance = relativeLuminance(backgroundHex);
  const contrastWithWhite = contrastRatio(bgLuminance, 1);
  const contrastWithDark = contrastRatio(bgLuminance, DARK_INK_LUMINANCE);
  return contrastWithWhite >= contrastWithDark ? LIGHT_INK : DARK_INK;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const bigint = parseInt(full, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

/**
 * Pour un texte (lien, libellé) posé sur le fond de page, et non sur un
 * aplat de la couleur de marque : on assombrit (fond clair) ou on éclaircit
 * (fond sombre) la teinte de marque, en conservant sa teinte/saturation,
 * jusqu'à atteindre 4.5:1 contre le fond de référence — sans quoi une marque
 * de couleur claire (ex. terracotta) reste illisible en tant que lien.
 */
function ensureForegroundContrast(hex: string, backgroundHex: string, targetRatio = 4.5): string {
  const bgLuminance = relativeLuminance(backgroundHex);
  const darkenTowardsBlack = bgLuminance > 0.5;
  let [h, s, l] = rgbToHsl(hexToRgb(hex));
  let candidate = hex;
  for (let i = 0; i < 40; i++) {
    const rgb = hslToRgb([h, s, l]);
    candidate = rgbToHex(...rgb);
    const ratio = contrastRatio(relativeLuminance(candidate), bgLuminance);
    if (ratio >= targetRatio) return candidate;
    l = darkenTowardsBlack ? Math.max(0, l - 0.025) : Math.min(1, l + 0.025);
  }
  return candidate;
}

export async function applyBranding(organizationId: string) {
  const { data, error } = await supabase
    .from("branding_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) return;

  const root = document.documentElement.style;
  root.setProperty("--brand-primary", data.primary_color);
  root.setProperty("--brand-secondary", data.secondary_color);
  root.setProperty("--brand-accent", data.accent_color);
  root.setProperty("--brand-neutral", data.neutral_color);
  root.setProperty("--brand-font", data.font_family);
  root.setProperty("--brand-primary-ink", pickInkColor(data.primary_color));
  root.setProperty("--brand-secondary-ink", pickInkColor(data.secondary_color));
  // Texte/liens en couleur secondaire posés sur le fond de page (pas un aplat) :
  // référence blanc pur en clair, slate-900 en sombre — les pires cas réalistes.
  root.setProperty("--brand-secondary-fg", ensureForegroundContrast(data.secondary_color, "#ffffff"));
  root.setProperty("--brand-secondary-fg-dark", ensureForegroundContrast(data.secondary_color, "#0f172a"));

  document.title = data.display_name;
  if (data.favicon_url) {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (link) link.href = data.favicon_url;
  }

  currentBranding = { displayName: data.display_name, logoUrl: data.logo_url };
}

/**
 * Called once at boot, before the first render, so there's no flash of
 * default branding. Resolves the organization from the active session if
 * logged in; otherwise falls back to the single/first org's branding
 * (branding_settings is publicly readable) since there's no subdomain-based
 * tenant resolution yet — fine for this single-org dev setup, but a real
 * multi-tenant deploy would need to resolve the org from the host/subdomain
 * before login instead.
 */
export async function bootBranding() {
  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", sessionData.session.user.id)
      .single();
    if (profile?.organization_id) {
      await applyBranding(profile.organization_id);
      return;
    }
  }

  const { data: branding } = await supabase.from("branding_settings").select("organization_id").limit(1).single();
  if (branding?.organization_id) {
    await applyBranding(branding.organization_id);
  }
}
