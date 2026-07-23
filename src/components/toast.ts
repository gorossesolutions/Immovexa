export function showToast(message: string, variant: "success" | "error" = "success") {
  const el = document.createElement("div");
  const color = variant === "success" ? "bg-primary text-primary-ink" : "bg-red-600 text-white";
  el.className = `fixed bottom-4 right-4 z-50 ${color} text-sm px-4 py-2 rounded-md shadow-lg`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
