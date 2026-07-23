import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Lease } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { statusBadge, creditBadge } from "../../components/status-badge";
import { renderDetailCard } from "../../components/detail-table";
import { LEASE_TYPE_LABELS, RENEWAL_TYPE_LABELS } from "../admin/leases";

type TenantLease = Lease & { properties: { reference: string; city: string; address_line: string } | null };

async function fetchActiveLease(): Promise<TenantLease | null> {
  const { data } = await supabase
    .from("leases")
    .select("*, properties(reference, city, address_line)")
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as unknown as TenantLease | null;
}

async function fetchLeaseCredit(leaseId: string): Promise<number> {
  const { data: account } = await supabase
    .from("billing_accounts")
    .select("id")
    .eq("owner_entity_type", "lease")
    .eq("owner_entity_id", leaseId)
    .maybeSingle();
  if (!account) return 0;

  const { data: credit } = await supabase
    .from("billing_account_credit")
    .select("available_credit")
    .eq("billing_account_id", account.id)
    .maybeSingle();
  return credit?.available_credit ?? 0;
}

export async function renderTenantLease() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/tenant/lease");
  content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Chargement…</p>`;

  const lease = await fetchActiveLease();
  if (!lease) {
    content.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Aucun bail actif.</p>`;
    return;
  }
  const credit = await fetchLeaseCredit(lease.id);

  content.innerHTML = `
    <div class="flex items-start justify-between mb-6">
      <div>
        <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${lease.properties?.reference ?? "—"}</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">${lease.properties?.address_line ?? ""}, ${lease.properties?.city ?? ""}</p>
      </div>
      <div class="flex items-center gap-2">
        ${statusBadge(lease.status)}
        ${credit > 0 ? creditBadge(credit) : ""}
      </div>
    </div>

    ${renderDetailCard(
      [
        { label: "Date de début", value: lease.start_date },
        { label: "Date de fin", value: lease.end_date ?? "Indéterminée" },
        { label: "Loyer", value: lease.rent_amount.toLocaleString("fr-FR") },
        { label: "Charges", value: lease.charges_amount.toLocaleString("fr-FR") },
        { label: "Dépôt de garantie", value: lease.deposit_amount ? lease.deposit_amount.toLocaleString("fr-FR") : "—" },
        { label: "Jour de paiement", value: String(lease.payment_day) },
        { label: "Type de location", value: LEASE_TYPE_LABELS[lease.lease_type] ?? lease.lease_type },
        { label: "Renouvellement", value: RENEWAL_TYPE_LABELS[lease.renewal_type] ?? lease.renewal_type },
        ...(lease.notes ? [{ label: "Notes", value: lease.notes, span: true }] : []),
      ],
      3
    )}
  `;
}
