// Seul fichier de ce projet qui sait que charges.billing_account_id peut
// pointer vers un bail (owner_entity_type = 'lease'). Le module billing
// (0007) et le builder PDF partagé (_shared/pdf.ts) restent 100% génériques
// — même discipline que la séparation SQL 0007/0008.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSimplePdf, type PdfRow } from "../_shared/pdf.ts";
import { CORS_HEADERS } from "../_shared/cors.ts";

const CATEGORY_LABELS: Record<string, string> = {
  rent: "Loyer",
  late_fee: "Pénalité de retard",
  deposit: "Dépôt de garantie",
  service_charge: "Charges",
  other: "Autre",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Virement",
  cash: "Espèces",
  cheque: "Chèque",
  other: "Autre",
};

// toLocaleString("fr-FR") insère U+202F (espace fine insécable) comme
// séparateur de milliers, un caractère que la police PDF standard (WinAnsi)
// ne peut pas encoder. Formatage manuel avec un espace ASCII classique.
function formatAmount(amount: number, currency: string): string {
  const [intPart, decPart] = amount.toFixed(2).split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const amountStr = decPart === "00" ? withSpaces : `${withSpaces},${decPart}`;
  return `${amountStr} ${currency}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const chargeId = url.searchParams.get("charge_id");
  const type = url.searchParams.get("type");

  if (!chargeId || (type !== "receipt" && type !== "notice")) {
    return new Response("Paramètres invalides", { status: 400, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Non authentifié", { status: 401, headers: CORS_HEADERS });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  // La RLS (staff/owner/tenant, déjà testée ailleurs) filtre cette requête —
  // si l'appelant n'a pas le droit de voir cette charge, `charge` est null
  // et on répond 404. Aucune logique de permission écrite dans ce fichier.
  const { data: charge, error: chargeError } = await supabase.from("charges").select("*").eq("id", chargeId).single();

  if (chargeError || !charge) {
    return new Response("Charge introuvable ou accès refusé", { status: 404, headers: CORS_HEADERS });
  }
  if (type === "receipt" && charge.status !== "paid") {
    return new Response("Cette charge n'est pas payée", { status: 400, headers: CORS_HEADERS });
  }
  if (type === "notice" && !["open", "partially_paid"].includes(charge.status)) {
    return new Response("Cette charge n'est pas ouverte", { status: 400, headers: CORS_HEADERS });
  }

  const { data: billingAccount } = await supabase
    .from("billing_accounts")
    .select("owner_entity_id, owner_entity_type, currency")
    .eq("id", charge.billing_account_id)
    .single();

  const currency = billingAccount?.currency ?? "MUR";
  let propertyLabel = "—";
  let tenantNames = "—";

  if (billingAccount?.owner_entity_type === "lease") {
    const { data: lease } = await supabase
      .from("leases")
      .select("properties(reference, address_line, city)")
      .eq("id", billingAccount.owner_entity_id)
      .single();

    const property = lease?.properties as unknown as { reference: string; address_line: string; city: string } | null;
    if (property) {
      propertyLabel = `${property.reference} — ${property.address_line}, ${property.city}`;
    }

    const { data: leaseTenants } = await supabase
      .from("lease_tenants")
      .select("profiles(full_name)")
      .eq("lease_id", billingAccount.owner_entity_id);

    const names = (leaseTenants as unknown as { profiles: { full_name: string } | null }[] | null)
      ?.map((lt) => lt.profiles?.full_name)
      .filter((n): n is string => Boolean(n));
    if (names && names.length > 0) tenantNames = names.join(", ");
  }

  const { data: branding } = await supabase.from("branding_settings").select("display_name").eq("organization_id", charge.organization_id).single();
  const orgName = branding?.display_name ?? "GR Immo Suite";

  const rows: PdfRow[] = [
    { label: "Locataire", value: tenantNames },
    { label: "Bien", value: propertyLabel },
    { label: "Catégorie", value: CATEGORY_LABELS[charge.category] ?? charge.category },
  ];
  if (charge.period_start && charge.period_end) {
    rows.push({ label: "Période", value: `${charge.period_start} - ${charge.period_end}` });
  }

  let title: string;
  let highlightLabel: string;
  let highlightValue: string;
  let footerNote: string;
  const generatedOn = new Date().toLocaleDateString("fr-FR");

  if (type === "receipt") {
    const { data: allocations } = await supabase
      .from("payment_allocations")
      .select("payments(payment_date, payment_method)")
      .eq("charge_id", chargeId)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastPayment = allocations?.[0]?.payments as unknown as { payment_date: string; payment_method: string | null } | null;

    title = "Quittance";
    rows.push({ label: "Date de paiement", value: lastPayment?.payment_date ?? "—" });
    rows.push({
      label: "Méthode",
      value: lastPayment?.payment_method ? PAYMENT_METHOD_LABELS[lastPayment.payment_method] ?? lastPayment.payment_method : "—",
    });
    highlightLabel = "Montant payé";
    highlightValue = formatAmount(charge.amount, currency);
    footerNote = `Quittance générée automatiquement par ${orgName} le ${generatedOn}.`;
  } else {
    const { data: balance } = await supabase.from("charge_balances").select("amount_due").eq("charge_id", chargeId).single();

    title = "Avis d'échéance";
    rows.push({ label: "Date d'échéance", value: charge.due_date });
    highlightLabel = "Montant dû";
    highlightValue = formatAmount(balance?.amount_due ?? charge.amount, currency);
    footerNote = `Avis généré automatiquement par ${orgName} le ${generatedOn}.`;
  }

  const pdfBytes = await buildSimplePdf({ orgName, title, rows, highlightLabel, highlightValue, footerNote });

  return new Response(pdfBytes, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${type === "receipt" ? "quittance" : "avis-echeance"}-${chargeId}.pdf"`,
    },
  });
});
