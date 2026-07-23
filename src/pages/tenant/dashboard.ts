import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Charge } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { CARD_CLASSES } from "../../components/detail-table";
import { statusBadge, creditBadge } from "../../components/status-badge";

interface ActiveLease {
  id: string;
  start_date: string;
  end_date: string | null;
  rent_amount: number;
  charges_amount: number;
  properties: { reference: string; city: string } | null;
}

async function fetchActiveLease(): Promise<ActiveLease | null> {
  const { data } = await supabase
    .from("leases")
    .select("id, start_date, end_date, rent_amount, charges_amount, properties(reference, city)")
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as unknown as ActiveLease | null;
}

async function fetchNextDueCharge(): Promise<Charge | null> {
  const { data } = await supabase
    .from("charges")
    .select("*")
    .neq("status", "paid")
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as Charge | null;
}

async function fetchOwnCredit(): Promise<number> {
  const { data } = await supabase.from("billing_account_credit").select("available_credit");
  return (data ?? []).reduce((sum, c) => sum + c.available_credit, 0);
}

export async function renderTenantDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/tenant");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const [lease, nextCharge, credit] = await Promise.all([fetchActiveLease(), fetchNextDueCharge(), fetchOwnCredit()]);

  content.innerHTML = `
    <div class="flex items-center gap-3 mb-1">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
      ${credit > 0 ? creditBadge(credit) : ""}
    </div>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Vue d'ensemble de votre location.</p>

    <div class="grid md:grid-cols-2 gap-6">
      <div class="${CARD_CLASSES} p-6">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Bail actif</h2>
        ${
          lease
            ? `<p class="text-sm text-slate-700 dark:text-slate-300">${lease.properties?.reference ?? "—"} — ${lease.properties?.city ?? ""}</p>
               <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${lease.start_date} → ${lease.end_date ?? "indéterminée"}</p>
               <p class="text-sm text-slate-900 dark:text-slate-100 mt-3">${(lease.rent_amount + lease.charges_amount).toLocaleString("fr-FR")} / mois</p>`
            : `<p class="text-sm text-slate-500 dark:text-slate-400">Aucun bail actif.</p>`
        }
      </div>

      <div class="${CARD_CLASSES} p-6">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Prochaine échéance</h2>
        ${
          nextCharge
            ? `<p class="text-sm text-slate-700 dark:text-slate-300">${nextCharge.amount.toLocaleString("fr-FR")}</p>
               <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Échéance le ${nextCharge.due_date}</p>
               <div class="mt-2">${statusBadge(nextCharge.status)}</div>`
            : `<p class="text-sm text-slate-500 dark:text-slate-400">Aucune échéance en attente.</p>`
        }
      </div>
    </div>
  `;
}
