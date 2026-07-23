let modalRoot: HTMLDivElement | null = null;
let lastFocusedElement: HTMLElement | null = null;

export type ModalSize = "md" | "lg" | "xl";

const SIZE_CLASSES: Record<ModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null);
}

export function openModal(title: string, bodyHtml: string, opts: { size?: ModalSize } = {}): HTMLDivElement {
  closeModal();

  lastFocusedElement = document.activeElement as HTMLElement | null;

  const size = opts.size ?? "md";
  modalRoot = document.createElement("div");
  modalRoot.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4";
  modalRoot.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"
      class="bg-white dark:bg-slate-900 rounded-xl shadow-lg w-full ${SIZE_CLASSES[size]} max-h-[90vh] overflow-y-auto outline-none">
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 id="modal-title" class="text-base font-semibold text-slate-900 dark:text-slate-100">${title}</h2>
        <button id="modal-close" class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Fermer">✕</button>
      </div>
      <div class="p-6" id="modal-body">${bodyHtml}</div>
    </div>
  `;
  document.body.appendChild(modalRoot);

  const dialog = modalRoot.querySelector<HTMLDivElement>("[role='dialog']")!;

  modalRoot.querySelector<HTMLButtonElement>("#modal-close")!.addEventListener("click", closeModal);
  modalRoot.addEventListener("click", (e) => {
    if (e.target === modalRoot) closeModal();
  });

  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }

    if (e.key === "Tab") {
      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Focus lands on the dialog container itself (not a specific control), so the
  // very next Tab press moves to the first focusable element — the close button,
  // since it's first in the dialog's DOM order — per the WCAG dialog pattern.
  dialog.focus();

  return modalRoot;
}

export function closeModal() {
  modalRoot?.remove();
  modalRoot = null;
  lastFocusedElement?.focus();
  lastFocusedElement = null;
}

export function modalBody(): HTMLDivElement {
  return document.querySelector<HTMLDivElement>("#modal-body")!;
}
