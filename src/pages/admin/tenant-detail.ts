import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Charge, ChargeBalance } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge } from "../../components/status-badge";
import { CARD_CLASSES } from "../../components/detail-table";
import { LEASE_TYPE_LABELS } from "./leases";

interface TenantProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

interface TenantLease {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  rent_amount: number;
  lease_type: string;
  properties: { id: string; reference: string; city: string } | null;
}

interface ChargeRow extends Charge {
  balance?: ChargeBalance;
  leaseId?: string;
}

async function fetchTenant(id: string): Promise<TenantProfile | null> {
  const { data } = await supabase.from("profiles").select("id, full_name, email, phone").eq("id", id).eq("role", "tenant").single();
  return data as TenantProfile | null;
}

async function fetchTenantLeases(tenantId: string): Promise<TenantLease[]> {
  const { data } = await supabase
    .from("lease_tenants")
    .select("leases(id, status, start_date, end_date, rent_amount, lease_type, properties(id, reference, city))")
    .eq("tenant_id", tenantId);
  return ((data as unknown as { leases: TenantLease | null }[] | null) ?? []).map((d) => d.leases).filter((l): l is TenantLease => l !== null);
}

async function fetchTenantCharges(leaseIds: string[]): Promise<ChargeRow[]> {
  if (!leaseIds.length) return [];

  const { data: accounts } = await supabase
    .from("billing_accounts")
    .select("id, owner_entity_id")
    .eq("owner_entity_type", "lease")
    .in("owner_entity_id", leaseIds);
  const accountIds = (accounts ?? []).map((a) => a.id);
  if (!accountIds.length) return [];

  const leaseIdByAccount = new Map((accounts ?? []).map((a) => [a.id, a.owner_entity_id]));

  const [{ data: charges }, { data: balances }] = await Promise.all([
    supabase.from("charges").select("*").in("billing_account_id", accountIds).order("due_date", { ascending: false }),
    supabase.from("charge_balances").select("*"),
  ]);

  const balanceByCharge = new Map((balances as ChargeBalance[] | null ?? []).map((b) => [b.charge_id, b]));
  return (charges as Charge[] | null ?? []).map((c) => ({
    ...c,
    balance: balanceByCharge.get(c.id),
    leaseId: leaseIdByAccount.get(c.billing_account_id),
  }));
}

export async function renderAdminTenantDetail(params: Record<string, string>) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/admin/tenants");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const tenant = await fetchTenant(params.id);
  if (!tenant) {
    content.innerHTML = `<p class="text-sm text-red-600">Locataire introuvable.</p>`;
    return;
  }

  const leases = await fetchTenantLeases(tenant.id);
  const charges = await fetchTenantCharges(leases.map((l) => l.id));
  const leaseById = new Map(leases.map((l) => [l.id, l]));

  const leasesHtml = leases.length
    ? leases
        .map(
          (l) => `
        <div class="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
          <div>
            <a href="/admin/leases/${l.id}" data-link class="text-sm font-medium text-secondary-fg dark:text-secondary-fg-dark hover:underline">${l.properties?.reference ?? "—"} — ${l.properties?.city ?? ""}</a>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${l.start_date} → ${l.end_date ?? "indéterminée"} · ${LEASE_TYPE_LABELS[l.lease_type] ?? l.lease_type} · ${l.rent_amount.toLocaleString("fr-FR")}</p>
          </div>
          ${statusBadge(l.status)}
        </div>`
        )
        .join("")
    : `<p class="text-sm text-slate-500 dark:text-slate-400 py-2">Aucun bail.</p>`;

  const chargesHtml = charges.length
    ? `<div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
         <table class="w-full">
           <thead class="bg-slate-50 dark:bg-slate-800/60"><tr>
             <th class="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Bien</th>
             <th class="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Échéance</th>
             <th class="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Montant</th>
             <th class="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Payé</th>
             <th class="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-4 py-2">Statut</th>
           </tr></thead>
           <tbody>
             ${charges
               .map((c) => {
                 const lease = c.leaseId ? leaseById.get(c.leaseId) : undefined;
                 return `<tr class="border-t border-slate-100 dark:border-slate-800">
                   <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${lease?.properties?.reference ?? "—"}</td>
                   <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${c.due_date}</td>
                   <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 text-right tabular-nums">${c.amount.toLocaleString("fr-FR")}</td>
                   <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 text-right tabular-nums">${(c.balance?.amount_paid ?? 0).toLocaleString("fr-FR")}</td>
                   <td class="px-4 py-3">${statusBadge(c.status)}</td>
                 </tr>`;
               })
               .join("")}
           </tbody>
         </table>
       </div>`
    : `<p class="text-sm text-slate-500 dark:text-slate-400 py-2">Aucun paiement.</p>`;

  content.innerHTML = `
    <a href="/admin/tenants" data-link class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">&larr; Retour aux locataires</a>
    <div class="mt-3 mb-6">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${tenant.full_name}</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">${tenant.email}${tenant.phone ? ` · ${tenant.phone}` : ""}</p>
    </div>

    <div class="${CARD_CLASSES} p-6 mb-6">
      <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Baux</h2>
      ${leasesHtml}
    </div>

    <div class="${CARD_CLASSES} p-6">
      <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Paiements</h2>
      ${chargesHtml}
    </div>
  `;
}
