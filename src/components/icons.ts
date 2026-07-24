export const PENCIL_ICON =
  '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

export const TRASH_ICON =
  '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

export const EMPTY_ICON =
  '<svg class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 6 4h12l3 4.5"/><path d="M3 8.5v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-10"/><path d="M3 8.5h18"/><path d="M9 12.5a3 3 0 0 0 6 0"/></svg>';

export const KPI_ICONS = {
  contract: '<path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 2.5-1.5c1.4 0 2.5 1 2.5 2s-1 1.5-2.5 2-2.5 1-2.5 2 1.1 2 2.5 2a2.5 2.5 0 0 0 2.5-1.5"/><line x1="12" y1="6.5" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="17.5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><line x1="8" y1="7" x2="8" y2="7.01"/><line x1="12" y1="7" x2="12" y2="7.01"/><line x1="16" y1="7" x2="16" y2="7.01"/><line x1="8" y1="11" x2="8" y2="11.01"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="16" y1="11" x2="16" y2="11.01"/><rect x="9" y="15" width="6" height="6"/>',
  alert: '<path d="M10.3 3.9 1.9 18a1.5 1.5 0 0 0 1.3 2.3h17.6a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/><line x1="12" y1="9.5" x2="12" y2="13.5"/><line x1="12" y1="16.5" x2="12" y2="16.51"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
} as const;

export function kpiIcon(name: keyof typeof KPI_ICONS): string {
  return `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${KPI_ICONS[name]}</svg>`;
}
