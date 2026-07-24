import { EMPTY_ICON } from "./icons";

export interface DataTableColumn<T> {
  label: string;
  render: (row: T) => string;
}

export interface DataTableAction<T> {
  label: string;
  icon?: string;
  variant?: "primary" | "danger" | "solid" | "solid-danger";
  onClick: (row: T) => void;
  show?: (row: T) => boolean;
}

export interface DataTableFilter<T> {
  key: string;
  label: string;
  value: (row: T) => string;
}

export interface DataTableOptions<T extends { id: string }> {
  columns: DataTableColumn<T>[];
  rows: T[];
  actions?: DataTableAction<T>[];
  filters?: DataTableFilter<T>[];
  emptyMessage?: string;
  emptySubtitle?: string;
  emptyCta?: { label: string; onClick: () => void };
  onRowClick?: (row: T) => void;
}

const filterState = new WeakMap<HTMLElement, Record<string, string>>();

function drawTable<T extends { id: string }>(
  container: HTMLElement,
  opts: Omit<DataTableOptions<T>, "filters">
) {
  const { columns, rows, actions = [], emptyMessage = "Aucune donnée.", emptySubtitle, emptyCta, onRowClick } = opts;

  if (rows.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <span class="text-slate-300 dark:text-slate-700">${EMPTY_ICON}</span>
        <p class="text-sm font-medium text-slate-700 dark:text-slate-300">${emptyMessage}</p>
        <p class="text-xs text-slate-400 dark:text-slate-500">${emptySubtitle ?? "Les éléments ajoutés apparaîtront ici."}</p>
        ${
          emptyCta
            ? `<button id="empty-state-cta" class="mt-2 rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">${emptyCta.label}</button>`
            : ""
        }
      </div>
    `;
    if (emptyCta) {
      container.querySelector<HTMLButtonElement>("#empty-state-cta")!.addEventListener("click", emptyCta.onClick);
    }
    return;
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));

  const headCells = columns
    .map((col) => `<th class="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">${col.label}</th>`)
    .join("");
  const actionsHead = actions.length ? `<th class="px-4 py-2"></th>` : "";

  const bodyRows = rows
    .map((row) => {
      const cells = columns.map((col) => `<td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${col.render(row)}</td>`).join("");
      const actionButtons = actions
        .map((action, i) => {
          if (action.show && !action.show(row)) return "";
          const icon = action.icon ? `<span class="inline-flex">${action.icon}</span>` : "";
          let cls: string;
          switch (action.variant) {
            case "solid":
              cls = "inline-flex items-center gap-1.5 rounded-md bg-secondary text-secondary-ink px-2.5 py-1 hover:opacity-90";
              break;
            case "solid-danger":
              cls = "inline-flex items-center gap-1.5 rounded-md bg-danger text-white px-2.5 py-1 hover:opacity-90";
              break;
            case "danger":
              cls = "text-red-600 dark:text-red-400 hover:underline";
              break;
            default:
              cls = "text-secondary-fg dark:text-secondary-fg-dark hover:underline";
          }
          return `<button data-row-id="${row.id}" data-action-index="${i}" class="text-xs font-medium ${cls} mr-2 last:mr-0">${icon}${action.label}</button>`;
        })
        .join("");
      const actionsCell = actions.length ? `<td class="px-4 py-3 text-right whitespace-nowrap">${actionButtons}</td>` : "";
      const clickable = onRowClick ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60" : "";
      return `<tr data-row-id="${row.id}" class="border-t border-slate-100 dark:border-slate-800 ${clickable}">${cells}${actionsCell}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <table class="w-full">
        <thead class="bg-slate-50 dark:bg-slate-800/60"><tr>${headCells}${actionsHead}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;

  if (actions.length) {
    container.querySelectorAll<HTMLButtonElement>("button[data-action-index]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = rowsById.get(btn.dataset.rowId!);
        const action = actions[Number(btn.dataset.actionIndex)];
        if (row && action) action.onClick(row);
      });
    });
  }

  if (onRowClick) {
    container.querySelectorAll<HTMLTableRowElement>("tr[data-row-id]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const row = rowsById.get(tr.dataset.rowId!);
        if (row) onRowClick(row);
      });
    });
  }
}

export function renderDataTable<T extends { id: string }>(container: HTMLElement, opts: DataTableOptions<T>) {
  const { rows, filters = [] } = opts;

  const state = filterState.get(container) ?? {};
  filterState.set(container, state);

  const filteredRows = rows.filter((row) => filters.every((f) => !state[f.key] || f.value(row) === state[f.key]));

  const toolbarHtml = filters.length
    ? `<div class="flex flex-wrap gap-2 mb-3">${filters.map((f) => filterComboboxHtml(f, state)).join("")}</div>`
    : "";

  container.innerHTML = `${toolbarHtml}<div id="table-wrapper"></div>`;
  const tableWrapper = container.querySelector<HTMLDivElement>("#table-wrapper")!;
  drawTable(tableWrapper, { ...opts, rows: filteredRows });

  filters.forEach((f) => wireCombobox(container, f, rows, state, opts));
}

function filterComboboxHtml<T>(filter: DataTableFilter<T>, state: Record<string, string>): string {
  const selected = state[filter.key] ?? "";
  return `
    <div class="relative" data-filter-key="${filter.key}">
      <input type="text" autocomplete="off"
        value="${selected}"
        placeholder="${filter.label}"
        class="filter-input w-44 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-secondary/40" />
      <div class="filter-dropdown hidden absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg text-xs py-1"></div>
    </div>
  `;
}

function wireCombobox<T extends { id: string }>(
  container: HTMLElement,
  filter: DataTableFilter<T>,
  rows: T[],
  state: Record<string, string>,
  opts: DataTableOptions<T>
) {
  const wrapper = container.querySelector<HTMLDivElement>(`[data-filter-key="${filter.key}"]`)!;
  const input = wrapper.querySelector<HTMLInputElement>(".filter-input")!;
  const dropdown = wrapper.querySelector<HTMLDivElement>(".filter-dropdown")!;
  const allValues = Array.from(new Set(rows.map((r) => filter.value(r)))).sort((a, b) => a.localeCompare(b));

  function renderOptions(query: string) {
    const q = query.trim().toLowerCase();
    const matches = allValues.filter((v) => v.toLowerCase().includes(q));
    const optionButtons = [
      `<button type="button" data-value="" class="block w-full text-left px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Tous</button>`,
      ...matches.map(
        (v) =>
          `<button type="button" data-value="${v}" class="block w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">${v}</button>`
      ),
    ];
    dropdown.innerHTML = matches.length || !q
      ? optionButtons.join("")
      : `<p class="px-3 py-1.5 text-slate-400">Aucun résultat</p>`;

    dropdown.querySelectorAll<HTMLButtonElement>("button[data-value]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const value = btn.dataset.value!;
        const newState = { ...state, [filter.key]: value };
        filterState.set(container, newState);
        renderDataTable(container, opts);
      });
    });
  }

  input.addEventListener("focus", () => {
    renderOptions("");
    dropdown.classList.remove("hidden");
  });
  input.addEventListener("input", () => {
    renderOptions(input.value);
    dropdown.classList.remove("hidden");
  });
  input.addEventListener("blur", () => {
    dropdown.classList.add("hidden");
    input.value = state[filter.key] ?? "";
  });
}
