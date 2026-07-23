const STORAGE_KEY = "gr-immo-color-scheme";

export type ColorScheme = "light" | "dark";

export function getColorScheme(): ColorScheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyColorScheme(scheme: ColorScheme) {
  document.documentElement.setAttribute("data-theme", scheme);
}

export function initColorScheme() {
  applyColorScheme(getColorScheme());
}

export function toggleColorScheme(): ColorScheme {
  const next: ColorScheme = getColorScheme() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  applyColorScheme(next);
  return next;
}
