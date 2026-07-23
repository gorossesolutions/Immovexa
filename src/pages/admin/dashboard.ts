import { supabase } from "../../lib/supabase";
import { getCurrentProfile } from "../../lib/auth";
import type { Property } from "../../lib/types";
import { renderPortalShell } from "../../components/nav-sidebar";
import { CARD_CLASSES, renderDetailCard } from "../../components/detail-table";
import { openModal, closeModal } from "../../components/modal";
import { navigate } from "../../router";
import { fetchPropertyOptions, fetchTenantOptions, openLeaseModal } from "./leases";
import { openListingModal } from "./listings";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthRange(): { start: Date; end: Date; startISO: string; endISO: string; daysInMonth: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start,
    end,
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10),
    daysInMonth: end.getDate(),
  };
}

// ============================================================
// Filtre de période du Gantt
// ============================================================

const GANTT_RANGE_OPTIONS = [
  { months: 1, label: "Mois courant" },
  { months: 3, label: "3 mois" },
  { months: 6, label: "6 mois" },
  { months: 12, label: "1 an" },
  { months: 24, label: "2 ans" },
] as const;

function ganttRange(months: number): { start: Date; end: Date; startISO: string; endISO: string; totalDays: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + months, 0);
  const totalDays = Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1;
  return {
    start,
    end,
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10),
    totalDays,
  };
}

// ============================================================
// KPIs
// ============================================================

async function fetchActiveLeasesCount(): Promise<number> {
  const { count } = await supabase.from("leases").select("id", { count: "exact", head: true }).eq("status", "active");
  return count ?? 0;
}

async function fetchMonthRevenue(startISO: string, endISO: string): Promise<number> {
  const { data } = await supabase.from("payments").select("amount").gte("payment_date", startISO).lte("payment_date", endISO);
  return (data ?? []).reduce((sum, p) => sum + p.amount, 0);
}

async function fetchOccupancyRate(): Promise<number> {
  const { data } = await supabase.from("properties").select("status").neq("status", "archived");
  const rows = data ?? [];
  if (rows.length === 0) return 0;
  const occupied = rows.filter((r) => r.status === "occupied").length;
  return Math.round((occupied / rows.length) * 100);
}

async function fetchOverdue(): Promise<{ total: number; count: number }> {
  const { data: charges } = await supabase.from("charges").select("id").neq("status", "paid").lt("due_date", todayISO());
  const overdueIds = (charges ?? []).map((c) => c.id);
  if (overdueIds.length === 0) return { total: 0, count: 0 };
  const { data: balances } = await supabase.from("charge_balances").select("charge_id, amount_due").in("charge_id", overdueIds);
  const total = (balances ?? []).reduce((sum, b) => sum + b.amount_due, 0);
  return { total, count: overdueIds.length };
}

async function fetchAvailableCount(): Promise<number> {
  const { count } = await supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", "vacant");
  return count ?? 0;
}

function kpiCard(label: string, value: string, alert?: boolean): string {
  return `
    <div class="${CARD_CLASSES} p-4">
      <div class="flex items-center justify-between">
        <p class="text-xs text-slate-500 dark:text-slate-400">${label}</p>
        ${alert ? `<span class="text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-full px-2 py-0.5">Action requise</span>` : ""}
      </div>
      <p class="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-1">${value}</p>
    </div>
  `;
}

// ============================================================
// Prochaines échéances (48h)
// ============================================================

interface UpcomingCharge {
  id: string;
  due_date: string;
  amount: number;
  propertyRef: string;
  tenantName: string;
}

async function fetchUpcomingCharges(): Promise<UpcomingCharge[]> {
  const today = new Date();
  const in48h = new Date(today.getTime() + 48 * 3600 * 1000);

  const { data: charges } = await supabase
    .from("charges")
    .select("id, due_date, amount, billing_account_id")
    .neq("status", "paid")
    .gte("due_date", todayISO())
    .lte("due_date", in48h.toISOString().slice(0, 10))
    .order("due_date", { ascending: true });

  if (!charges || charges.length === 0) return [];

  const { data: accounts } = await supabase
    .from("billing_accounts")
    .select("id, owner_entity_id")
    .eq("owner_entity_type", "lease")
    .in("id", charges.map((c) => c.billing_account_id));
  const leaseByAccount = new Map((accounts ?? []).map((a) => [a.id, a.owner_entity_id]));
  const leaseIds = [...new Set([...leaseByAccount.values()])];

  const { data: leases } = leaseIds.length
    ? await supabase.from("leases").select("id, properties(reference), lease_tenants(is_primary, profiles(full_name))").in("id", leaseIds)
    : { data: [] as any[] };
  const leaseById = new Map((leases as any[] ?? []).map((l) => [l.id, l]));

  return charges.map((c) => {
    const leaseId = leaseByAccount.get(c.billing_account_id);
    const lease = leaseId ? leaseById.get(leaseId) : null;
    const primary = lease?.lease_tenants?.find((lt: any) => lt.is_primary) ?? lease?.lease_tenants?.[0];
    return {
      id: c.id,
      due_date: c.due_date,
      amount: c.amount,
      propertyRef: lease?.properties?.reference ?? "—",
      tenantName: primary?.profiles?.full_name ?? "—",
    };
  });
}

function upcomingChargesHtml(charges: UpcomingCharge[]): string {
  if (charges.length === 0) {
    return `<p class="text-sm text-slate-500 dark:text-slate-400 py-2">Aucune échéance dans les 48 prochaines heures.</p>`;
  }
  return charges
    .map(
      (c) => `
      <div class="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-slate-100">${c.propertyRef} — ${c.tenantName}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">Échéance le ${c.due_date}</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-sm tabular-nums text-slate-700 dark:text-slate-300">${c.amount.toLocaleString("fr-FR")} MUR</span>
          <a href="/admin/payments" data-link class="text-xs text-secondary-fg dark:text-secondary-fg-dark hover:underline">Voir →</a>
        </div>
      </div>`
    )
    .join("");
}

// ============================================================
// Gantt des baux
// ============================================================

interface GanttLease {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  rent_amount: number;
  charges_amount: number;
  tenantName: string;
  hasOverdue: boolean;
}

interface GanttRow {
  propertyId: string;
  propertyRef: string;
  lease: GanttLease | null;
}

async function fetchOverdueLeaseIds(): Promise<Set<string>> {
  const { data: accounts } = await supabase.from("billing_accounts").select("id, owner_entity_id").eq("owner_entity_type", "lease");
  const leaseByAccount = new Map((accounts ?? []).map((a) => [a.id, a.owner_entity_id]));

  const { data: charges } = await supabase.from("charges").select("billing_account_id").neq("status", "paid").lt("due_date", todayISO());

  const result = new Set<string>();
  for (const c of charges ?? []) {
    const leaseId = leaseByAccount.get(c.billing_account_id);
    if (leaseId) result.add(leaseId);
  }
  return result;
}

async function fetchGanttRows(startISO: string, endISO: string): Promise<GanttRow[]> {
  const [{ data: properties }, { data: leases }, overdueLeaseIds] = await Promise.all([
    supabase.from("properties").select("id, reference").neq("status", "archived").order("reference"),
    supabase
      .from("leases")
      .select("id, property_id, status, start_date, end_date, rent_amount, charges_amount, lease_tenants(is_primary, profiles(full_name))")
      .lte("start_date", endISO)
      .or(`end_date.is.null,end_date.gte.${startISO}`),
    fetchOverdueLeaseIds(),
  ]);

  const leasesByProperty = new Map<string, any[]>();
  for (const l of (leases as any[]) ?? []) {
    const arr = leasesByProperty.get(l.property_id) ?? [];
    arr.push(l);
    leasesByProperty.set(l.property_id, arr);
  }

  return (properties ?? []).map((p) => {
    const candidates = leasesByProperty.get(p.id) ?? [];
    const chosen = candidates.find((l) => l.status === "active") ?? candidates[0];
    if (!chosen) return { propertyId: p.id, propertyRef: p.reference, lease: null };

    const primary = chosen.lease_tenants.find((lt: any) => lt.is_primary) ?? chosen.lease_tenants[0];
    return {
      propertyId: p.id,
      propertyRef: p.reference,
      lease: {
        id: chosen.id,
        status: chosen.status,
        start_date: chosen.start_date,
        end_date: chosen.end_date,
        rent_amount: chosen.rent_amount,
        charges_amount: chosen.charges_amount,
        tenantName: primary?.profiles?.full_name ?? "—",
        hasOverdue: overdueLeaseIds.has(chosen.id),
      },
    };
  });
}

function barColorClass(lease: GanttLease): string {
  if (lease.hasOverdue) return "bg-red-500";
  if (lease.status === "active") return "bg-emerald-500";
  if (new Date(lease.start_date) > new Date()) return "bg-blue-500";
  return "bg-slate-400";
}

function barLabel(lease: GanttLease): string {
  if (lease.hasOverdue) return "En retard";
  if (lease.status === "active") return "En cours";
  if (new Date(lease.start_date) > new Date()) return "À venir";
  return "Terminé";
}

function computeBarStyle(lease: GanttLease, rangeStart: Date, rangeEnd: Date, totalDays: number): { left: number; width: number } {
  const dayMs = 24 * 3600 * 1000;
  const leaseStart = new Date(lease.start_date);
  const leaseEnd = lease.end_date ? new Date(lease.end_date) : null;

  const clipStart = leaseStart < rangeStart ? rangeStart : leaseStart;
  const clipEnd = !leaseEnd || leaseEnd > rangeEnd ? rangeEnd : leaseEnd;

  const startOffset = Math.round((clipStart.getTime() - rangeStart.getTime()) / dayMs);
  const endOffset = Math.round((clipEnd.getTime() - rangeStart.getTime()) / dayMs);

  const left = (startOffset / totalDays) * 100;
  const width = Math.max(((endOffset - startOffset + 1) / totalDays) * 100, 1.5);
  return { left, width };
}

function openLeasePopover(row: GanttRow) {
  if (!row.lease) return;
  const l = row.lease;

  openModal(
    row.propertyRef,
    `
      ${renderDetailCard(
        [
          { label: "Locataire", value: l.tenantName },
          { label: "Période", value: `${l.start_date} → ${l.end_date ?? "indéterminée"}` },
          { label: "Montant", value: `${(l.rent_amount + l.charges_amount).toLocaleString("fr-FR")} MUR / mois` },
          { label: "Statut paiement", value: l.hasOverdue ? "En retard" : "À jour" },
        ],
        2
      )}
      <div class="mt-4 text-right">
        <button id="open-lease-link" class="text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">Ouvrir le bail →</button>
      </div>
    `
  );

  document.querySelector<HTMLButtonElement>("#open-lease-link")!.addEventListener("click", () => {
    closeModal();
    navigate(`/admin/leases/${l.id}`);
  });
}

function monthTicksHtml(rangeStart: Date, rangeEnd: Date, totalDays: number, stepMonths: number): string {
  const dayMs = 24 * 3600 * 1000;
  const ticks: string[] = [];
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor <= rangeEnd) {
    const offset = Math.round((cursor.getTime() - rangeStart.getTime()) / dayMs);
    const left = Math.max((offset / totalDays) * 100, 0);
    const label = cursor.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    ticks.push(`<span class="absolute top-0 -translate-x-1/2 first:translate-x-0" style="left:${left}%">${label}</span>`);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + stepMonths, 1);
  }
  return ticks.join("");
}

function ganttHtml(rows: GanttRow[], rangeStart: Date, rangeEnd: Date, totalDays: number, months: number): string {
  const isSingleMonth = totalDays <= 31;
  const stepMonths = months >= 24 ? 3 : 1;
  const header = isSingleMonth
    ? `<div class="flex-1 flex text-[10px] text-slate-400 dark:text-slate-500 pb-1">${Array.from({ length: totalDays }, (_, i) => i + 1)
        .map((d) => `<span class="flex-1 text-center">${d % 5 === 0 || d === 1 ? d : ""}</span>`)
        .join("")}</div>`
    : `<div class="relative flex-1 h-4 text-[10px] text-slate-400 dark:text-slate-500 pb-1">${monthTicksHtml(rangeStart, rangeEnd, totalDays, stepMonths)}</div>`;

  const rowsHtml = rows
    .map((row, i) => {
      const track = row.lease
        ? (() => {
            const { left, width } = computeBarStyle(row.lease!, rangeStart, rangeEnd, totalDays);
            return `<div data-row-index="${i}" class="absolute top-1 bottom-1 rounded ${barColorClass(row.lease!)} cursor-pointer hover:opacity-80 flex items-center px-2 overflow-hidden"
                      style="left:${left}%; width:${width}%;" title="${row.lease!.tenantName} — ${barLabel(row.lease!)}">
                      <span class="text-[10px] text-white truncate">${row.lease!.tenantName}</span>
                    </div>`;
          })()
        : `<span class="absolute inset-y-0 left-2 flex items-center text-xs text-slate-400 dark:text-slate-500">Vacant</span>`;

      return `
        <div class="flex items-center border-t border-slate-100 dark:border-slate-800">
          <div class="w-28 shrink-0 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 truncate">${row.propertyRef}</div>
          <div class="relative flex-1 h-9">${track}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="overflow-x-auto">
      <div class="min-w-[600px]">
        <div class="flex items-center border-b border-slate-200 dark:border-slate-800">
          <div class="w-28 shrink-0"></div>
          ${header}
        </div>
        ${rowsHtml || `<p class="text-sm text-slate-500 dark:text-slate-400 py-4">Aucun bien.</p>`}
      </div>
    </div>
    <div class="flex items-center gap-4 mt-4 text-xs text-slate-500 dark:text-slate-400">
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>À venir</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>En cours</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>En retard</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-slate-400"></span>Terminé</span>
    </div>
  `;
}

// ============================================================
// Galerie des biens disponibles
// ============================================================

async function fetchAvailableProperties(): Promise<Property[]> {
  const { data } = await supabase.from("properties").select("*").eq("status", "vacant").order("reference");
  return (data as Property[] | null) ?? [];
}

function galleryHtml(properties: Property[]): string {
  if (properties.length === 0) {
    return `<p class="text-sm text-slate-500 dark:text-slate-400 py-2">Aucun bien disponible actuellement.</p>`;
  }
  return `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${properties
        .map(
          (p) => `
        <a href="/admin/properties/${p.id}" data-link class="${CARD_CLASSES} overflow-hidden hover:border-secondary transition-colors block">
          <div class="h-24 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            ${
              p.cover_image_url
                ? `<img src="${p.cover_image_url}" alt="${p.reference}" class="w-full h-full object-cover" />`
                : `<svg class="w-8 h-8 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>`
            }
          </div>
          <div class="p-3">
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">${p.reference}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${p.city}</p>
            <span class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 mt-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>Disponible
            </span>
          </div>
        </a>`
        )
        .join("")}
    </div>
  `;
}

// ============================================================
// Page
// ============================================================

export async function renderAdminDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const organizationId = profile.organization_id;
  const content = renderPortalShell(profile, "/admin");
  content.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
      <div class="flex items-center gap-2">
        <button id="new-lease-btn" class="rounded-md bg-secondary text-secondary-ink text-sm font-medium px-4 py-2 hover:opacity-90">Nouveau bail</button>
        <button id="new-listing-btn" class="rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">Nouvelle annonce</button>
      </div>
    </div>
    <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Vue d'ensemble de l'organisation.</p>

    <div id="kpi-grid" class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6"></div>

    <div class="${CARD_CLASSES} p-6 mb-6">
      <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Prochaines échéances (48h)</h2>
      <div id="upcoming-charges"></div>
    </div>

    <div class="${CARD_CLASSES} p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Occupation</h2>
        <select id="gantt-range" class="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-secondary">
          ${GANTT_RANGE_OPTIONS.map((o) => `<option value="${o.months}">${o.label}</option>`).join("")}
        </select>
      </div>
      <div id="gantt"></div>
    </div>

    <div class="${CARD_CLASSES} p-6">
      <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Biens disponibles</h2>
      <div id="gallery"></div>
    </div>
  `;

  const { startISO, endISO } = monthRange();

  async function loadGantt(months: number) {
    const { start, end, startISO: rangeStartISO, endISO: rangeEndISO, totalDays } = ganttRange(months);
    const rows = await fetchGanttRows(rangeStartISO, rangeEndISO);
    const ganttEl = content.querySelector<HTMLDivElement>("#gantt")!;
    ganttEl.innerHTML = ganttHtml(rows, start, end, totalDays, months);
    ganttEl.querySelectorAll<HTMLDivElement>("[data-row-index]").forEach((el) => {
      el.addEventListener("click", () => {
        const row = rows[Number(el.dataset.rowIndex)];
        openLeasePopover(row);
      });
    });
  }

  const [activeLeases, monthRevenue, occupancyRate, overdue, availableCount, upcoming, availableProperties] = await Promise.all([
    fetchActiveLeasesCount(),
    fetchMonthRevenue(startISO, endISO),
    fetchOccupancyRate(),
    fetchOverdue(),
    fetchAvailableCount(),
    fetchUpcomingCharges(),
    fetchAvailableProperties(),
    loadGantt(1),
  ]);

  content.querySelector<HTMLDivElement>("#kpi-grid")!.innerHTML = [
    kpiCard("Baux actifs", String(activeLeases)),
    kpiCard("CA du mois", `${monthRevenue.toLocaleString("fr-FR")} MUR`),
    kpiCard("Taux d'occupation", `${occupancyRate}%`),
    kpiCard("Impayés en retard", `${overdue.total.toLocaleString("fr-FR")} MUR`, overdue.count > 0),
    kpiCard("Biens disponibles", String(availableCount)),
  ].join("");

  content.querySelector<HTMLDivElement>("#upcoming-charges")!.innerHTML = upcomingChargesHtml(upcoming);

  content.querySelector<HTMLSelectElement>("#gantt-range")!.addEventListener("change", (e) => {
    loadGantt(Number((e.target as HTMLSelectElement).value));
  });

  content.querySelector<HTMLDivElement>("#gallery")!.innerHTML = galleryHtml(availableProperties);

  content.querySelector<HTMLButtonElement>("#new-lease-btn")!.addEventListener("click", async () => {
    const [properties, tenants] = await Promise.all([fetchPropertyOptions(), fetchTenantOptions()]);
    openLeaseModal(properties, tenants, organizationId, () => renderAdminDashboard());
  });

  content.querySelector<HTMLButtonElement>("#new-listing-btn")!.addEventListener("click", () => {
    openListingModal(organizationId, () => renderAdminDashboard());
  });
}
