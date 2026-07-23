import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Charge, ChargeBalance } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { renderDataTable } from "../../components/data-table";
import { statusBadge, statusLabel } from "../../components/status-badge";
import { showToast } from "../../components/toast";
import { downloadChargePdf } from "../../lib/pdf";

const CHARGE_CATEGORY_LABELS: Record<string, string> = {
  rent: "Loyer",
  late_fee: "Pénalité de retard",
  deposit: "Dépôt de garantie",
  service_charge: "Charges",
  other: "Autre",
};

interface LeaseContext {
  propertyRef: string;
  city: string;
}

interface ChargeRow extends Charge {
  balance?: ChargeBalance;
  context?: LeaseContext;
}

async function fetchLeaseContextByBillingAccount(): Promise<Map<string, LeaseContext>> {
  const { data: accounts, error: accountsError } = await supabase
    .from("billing_accounts")
    .select("id, owner_entity_id")
    .eq("owner_entity_type", "lease");
  if (accountsError || !accounts || accounts.length === 0) return new Map();

  const leaseIds = accounts.map((a) => a.owner_entity_id);
  const { data: leases } = await supabase.from("leases").select("id, properties(reference, city)").in("id", leaseIds);
  const leaseById = new Map((leases as any[] | null ?? []).map((l) => [l.id, l]));

  const result = new Map<string, LeaseContext>();
  for (const account of accounts) {
    const lease = leaseById.get(account.owner_entity_id);
    if (!lease) continue;
    result.set(account.id, { propertyRef: lease.properties?.reference ?? "—", city: lease.properties?.city ?? "" });
  }
  return result;
}

async function fetchCharges(): Promise<ChargeRow[]> {
  const [{ data: charges, error }, { data: balances }, contextByAccount] = await Promise.all([
    supabase.from("charges").select("*").order("due_date", { ascending: false }),
    supabase.from("charge_balances").select("*"),
    fetchLeaseContextByBillingAccount(),
  ]);

  if (error) {
    showToast("Erreur de chargement des paiements", "error");
    return [];
  }

  const balanceByCharge = new Map((balances as ChargeBalance[] | null ?? []).map((b) => [b.charge_id, b]));

  return (charges as Charge[]).map((c) => ({
    ...c,
    balance: balanceByCharge.get(c.id),
    context: contextByAccount.get(c.billing_account_id),
  }));
}

export async function renderOwnerPayments() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const content = renderPortalShell(profile, "/owner/payments");
  content.innerHTML = `
    <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Paiements</h1>
    <div id="charges-table"></div>
  `;

  const tableEl = content.querySelector<HTMLDivElement>("#charges-table")!;
  const charges = await fetchCharges();

  renderDataTable(tableEl, {
    rows: charges,
    emptyMessage: "Aucune échéance.",
    columns: [
      { label: "Bien", render: (c) => (c.context ? `${c.context.propertyRef} — ${c.context.city}` : "—") },
      { label: "Catégorie", render: (c) => CHARGE_CATEGORY_LABELS[c.category] ?? c.category },
      { label: "Échéance", render: (c) => c.due_date },
      { label: "Montant", render: (c) => c.amount.toLocaleString("fr-FR") },
      { label: "Payé", render: (c) => (c.balance?.amount_paid ?? 0).toLocaleString("fr-FR") },
      { label: "Statut", render: (c) => statusBadge(c.status) },
    ],
    filters: [
      { key: "status", label: "Statut", value: (c) => statusLabel(c.status) },
      { key: "category", label: "Catégorie", value: (c) => CHARGE_CATEGORY_LABELS[c.category] ?? c.category },
    ],
    actions: [
      {
        label: "Quittance",
        variant: "solid",
        show: (c) => c.status === "paid",
        onClick: (c) => downloadChargePdf(c.id, "receipt", `quittance-${c.id}.pdf`),
      },
      {
        label: "Avis d'échéance",
        variant: "solid",
        show: (c) => c.status === "open" || c.status === "partially_paid",
        onClick: (c) => downloadChargePdf(c.id, "notice", `avis-echeance-${c.id}.pdf`),
      },
    ],
  });
}
