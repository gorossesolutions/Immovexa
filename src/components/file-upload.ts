export function renderFileUpload(
  container: HTMLElement,
  opts: { accept?: string; capture?: "environment" | "user"; placeholder?: string; onChange: (file: File | null) => void }
) {
  const placeholder = opts.placeholder ?? "Cliquer pour choisir un fichier";
  container.innerHTML = `
    <label class="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg px-4 py-6 text-center cursor-pointer hover:border-secondary transition">
      <span class="text-sm text-slate-500 dark:text-slate-400" id="file-upload-label">${placeholder}</span>
      <input type="file" class="hidden" ${opts.accept ? `accept="${opts.accept}"` : ""} ${opts.capture ? `capture="${opts.capture}"` : ""} />
    </label>
  `;

  const input = container.querySelector<HTMLInputElement>("input")!;
  const label = container.querySelector<HTMLSpanElement>("#file-upload-label")!;

  input.addEventListener("change", () => {
    const file = input.files?.[0] ?? null;
    label.textContent = file ? file.name : placeholder;
    opts.onChange(file);
  });
}
