import { statusLabel } from "../lib/status-labels";

const DOT_COLORS: Record<string, string> = {
  vacant: "bg-slate-400",
  occupied: "bg-emerald-500",
  maintenance: "bg-amber-500",
  archived: "bg-slate-400",
  draft: "bg-slate-400",
  active: "bg-emerald-500",
  ended: "bg-slate-400",
  terminated: "bg-red-500",
  pending: "bg-amber-500",
  partial: "bg-amber-500",
  partially_paid: "bg-amber-500",
  paid: "bg-emerald-500",
  late: "bg-red-500",
  waived: "bg-slate-400",
  open: "bg-amber-500",
  in_progress: "bg-blue-500",
  resolved: "bg-emerald-500",
  closed: "bg-slate-400",
  under_offer: "bg-red-500",
  sold: "bg-indigo-500",
  for_sale: "bg-blue-500",
  rented_long_term: "bg-emerald-500",
  short_term_active: "bg-purple-500",
  no_active_listing: "bg-slate-400",
  offer: "bg-amber-500",
  compromis: "bg-blue-500",
  deed_pending: "bg-amber-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-500",
  confirmed: "bg-emerald-500",
  checked_in: "bg-blue-500",
  checked_out: "bg-slate-400",
};

export { statusLabel };

export function statusBadge(status: string, label?: string): string {
  const dot = DOT_COLORS[status] ?? "bg-slate-400";
  const text = label ?? statusLabel(status);
  const emphasis = status === "under_offer" ? "font-semibold text-red-700 dark:text-red-400" : "font-medium text-slate-700 dark:text-slate-300";
  return `<span class="inline-flex items-center gap-1.5 text-xs ${emphasis}"><span class="w-1.5 h-1.5 rounded-full ${dot} shrink-0"></span>${text}</span>`;
}

export function creditBadge(amount: number): string {
  return `<span class="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-full px-2 py-0.5 ml-2 whitespace-nowrap">💰 Crédit : ${amount.toLocaleString("fr-FR")} MUR</span>`;
}
