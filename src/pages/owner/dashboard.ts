import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Property } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { CARD_CLASSES } from "../../components/detail-table";
import { KPI_ICONS, kpiIcon } from "../../components/icons";

function monthStartISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

async function fetchOwnerProperties(): Promise<Property[]> {
  const { data, error } = await supabase.from("properties").select("*").order("reference");
  if (error) return [];
  return data as Property[];
}

async function fetchMonthlyRevenue(): Promise<number> {
  const { data, error } = await supabase.from("payments").select("amount").gte("payment_date", monthStartISO());
  if (error) return 0;
  return (data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
}

function metricCard(label: string, value: string, icon: keyof typeof KPI_ICONS): string {
  return `
    <div class="${CARD_CLASSES} p-4">
      <p class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1">
        <span class="text-slate-400 dark:text-slate-500">${kpiIcon(icon)}</span>${label}
      </p>
      <p class="text-2xl font-semibold text-slate-900 dark:text-slate-100">${value}</p>
    </div>
  `;
}

export async function renderOwnerDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/owner");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const [properties, monthlyRevenue] = await Promise.all([fetchOwnerProperties(), fetchMonthlyRevenue()]);

  const total = properties.length;
  const occupied = properties.filter((p) => p.status === "occupied").length;
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const currency = properties[0]?.currency ?? "MUR";

  content.innerHTML = `
    <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Dashboard</h1>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Vue d'ensemble de vos biens.</p>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${metricCard("Biens", String(total), "home")}
      ${metricCard("Occupés", `${occupied} / ${total}`, "building")}
      ${metricCard("Taux d'occupation", `${occupancyRate}%`, "building")}
      ${metricCard("Revenus ce mois-ci", `${monthlyRevenue.toLocaleString("fr-FR")} ${currency}`, "money")}
    </div>
  `;
}
