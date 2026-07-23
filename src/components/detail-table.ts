export const CARD_CLASSES = "bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800";

export interface DetailField {
  label: string;
  value: string;
  span?: boolean;
}

export function renderDetailCard(fields: DetailField[], columns: 2 | 3 = 2): string {
  const gridCols = columns === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2";
  const items = fields
    .map(
      (f) => `
      <div class="${f.span ? "col-span-full" : ""}">
        <dt class="text-xs text-slate-500 dark:text-slate-400 uppercase">${f.label}</dt>
        <dd class="text-sm text-slate-900 dark:text-slate-100 ${f.span ? "mt-1" : ""}">${f.value}</dd>
      </div>`
    )
    .join("");
  return `<dl class="grid ${gridCols} gap-x-6 gap-y-4 ${CARD_CLASSES} p-6">${items}</dl>`;
}
