import type { Profile, Role } from "../lib/auth";
import type { AppNotification } from "../lib/types";
import { signOut } from "../lib/auth";
import { navigate } from "../router";
import { getColorScheme, toggleColorScheme } from "../lib/color-scheme";
import { supabase } from "../lib/supabase";
import { openModal, modalBody, closeModal } from "./modal";

export interface NavItem {
  label: string;
  path: string;
  icon: keyof typeof ICON_PATHS;
}

const ICON_PATHS: Record<string, string> = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  "file-text": '<rect x="5" y="3" width="14" height="18" rx="1.5"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14.5c2.8.3 5 2.7 5 5.5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><line x1="8" y1="7" x2="8" y2="7.01"/><line x1="12" y1="7" x2="12" y2="7.01"/><line x1="16" y1="7" x2="16" y2="7.01"/><line x1="8" y1="11" x2="8" y2="11.01"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="16" y1="11" x2="16" y2="11.01"/><rect x="9" y="15" width="6" height="6"/>',
  "credit-card": '<rect x="3" y="6" width="18" height="13" rx="1.5"/><line x1="3" y1="10" x2="21" y2="10"/>',
  folder: '<path d="M4 6a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z"/>',
  tag: '<path d="M20.6 12.3 12 3.7a1.5 1.5 0 0 0-1-.4H4.5A1.5 1.5 0 0 0 3 4.8v6.5c0 .4.2.8.4 1L12 20.9c.6.6 1.5.6 2.1 0l6.5-6.5c.6-.6.6-1.5 0-2.1z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  contact: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="2.3"/><path d="M8 16.5c0-1.9 1.8-3.3 4-3.3s4 1.4 4 3.3"/><line x1="4" y1="7" x2="5.2" y2="7"/><line x1="4" y1="17" x2="5.2" y2="17"/>',
};

function icon(name: keyof typeof ICON_PATHS, sizeClass = "w-[18px] h-[18px]"): string {
  return `<svg class="${sizeClass} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", path: "/admin", icon: "dashboard" },
  { label: "Biens", path: "/admin/properties", icon: "home" },
  { label: "Annonces", path: "/admin/listings", icon: "tag" },
  { label: "Location", path: "/admin/leases", icon: "file-text" },
  { label: "Locataires", path: "/admin/tenants", icon: "users" },
  { label: "Propriétaires", path: "/admin/owners", icon: "building" },
  { label: "Paiements", path: "/admin/payments", icon: "credit-card" },
  { label: "Documents", path: "/admin/documents", icon: "folder" },
  { label: "Maintenance", path: "/admin/maintenance", icon: "wrench" },
  { label: "Prestataires", path: "/admin/vendors", icon: "contact" },
];
const SETTINGS_NAV: NavItem = { label: "Paramètres", path: "/admin/settings", icon: "settings" };

const OWNER_NAV: NavItem[] = [
  { label: "Dashboard", path: "/owner", icon: "dashboard" },
  { label: "Mes biens", path: "/owner/properties", icon: "home" },
  { label: "Paiements", path: "/owner/payments", icon: "credit-card" },
  { label: "Documents", path: "/owner/documents", icon: "folder" },
];

const TENANT_NAV: NavItem[] = [
  { label: "Dashboard", path: "/tenant", icon: "dashboard" },
  { label: "Mon bail", path: "/tenant/lease", icon: "file-text" },
  { label: "Paiements", path: "/tenant/payments", icon: "credit-card" },
  { label: "Documents", path: "/tenant/documents", icon: "folder" },
  { label: "Maintenance", path: "/tenant/maintenance", icon: "wrench" },
];

export function navItemsForRole(role: Role): NavItem[] {
  switch (role) {
    case "admin":
      return [...ADMIN_NAV, SETTINGS_NAV];
    case "agent":
      return ADMIN_NAV;
    case "owner":
      return OWNER_NAV;
    case "tenant":
      return TENANT_NAV;
  }
}

const PORTAL_LABEL: Record<Role, string> = {
  admin: "Administration",
  agent: "Administration",
  owner: "Propriétaire",
  tenant: "Locataire",
};

const COLLAPSE_KEY = "gr-immo-sidebar-collapsed";

function isCollapsed(): boolean {
  return localStorage.getItem(COLLAPSE_KEY) === "1";
}

interface SidebarBranding {
  organizationId: string;
  displayName: string;
  logoUrl: string | null;
}

let brandingCache: SidebarBranding | null = null;

function applyBrandingToHeader(branding: SidebarBranding, nameEl: HTMLElement, logoSlot: HTMLElement) {
  nameEl.textContent = branding.displayName;
  logoSlot.innerHTML = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.displayName}" class="h-6 w-auto object-contain" />`
    : "";
}

async function loadSidebarBranding(organizationId: string, nameEl: HTMLElement, logoSlot: HTMLElement) {
  if (brandingCache && brandingCache.organizationId === organizationId) {
    applyBrandingToHeader(brandingCache, nameEl, logoSlot);
    return;
  }
  const { data } = await supabase
    .from("branding_settings")
    .select("display_name, logo_url")
    .eq("organization_id", organizationId)
    .single();
  if (!data) return;
  brandingCache = { organizationId, displayName: data.display_name, logoUrl: data.logo_url };
  applyBrandingToHeader(brandingCache, nameEl, logoSlot);
}

const BELL_ICON =
  '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>';
const MENU_ICON = '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>';

async function fetchUnreadCount(profileId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .is("read_at", null);
  return count ?? 0;
}

async function fetchNotifications(profileId: string): Promise<AppNotification[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as AppNotification[] | null) ?? [];
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `il y a ${diffD} j`;
}

async function refreshNotifBadges(profileId: string) {
  const count = await fetchUnreadCount(profileId);
  document.querySelectorAll<HTMLElement>(".notif-badge").forEach((el) => {
    el.textContent = String(count);
    el.classList.toggle("hidden", count === 0);
  });
}

async function openNotificationsModal(profile: Profile) {
  const notifications = await fetchNotifications(profile.id);

  const itemsHtml = notifications.length
    ? notifications
        .map(
          (n) => `
        <button data-notif-id="${n.id}" data-notif-link="${n.link ?? ""}"
          class="w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
            n.read_at ? "" : "bg-secondary/5"
          }">
          <p class="text-sm font-medium text-slate-900 dark:text-slate-100">${n.title}</p>
          ${n.body ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${n.body}</p>` : ""}
          <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1">${relativeTime(n.created_at)}</p>
        </button>`
        )
        .join("")
    : `<p class="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">Aucune notification.</p>`;

  openModal(
    "Notifications",
    `
      <div class="flex justify-end mb-2">
        <button id="mark-all-read" class="text-xs text-secondary-fg dark:text-secondary-fg-dark hover:underline">Tout marquer comme lu</button>
      </div>
      <div class="-mx-6 -mb-6 max-h-[60vh] overflow-y-auto border-t border-slate-100 dark:border-slate-800">${itemsHtml}</div>
    `
  );

  modalBody()
    .querySelector<HTMLButtonElement>("#mark-all-read")!
    .addEventListener("click", async () => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("profile_id", profile.id).is("read_at", null);
      closeModal();
      refreshNotifBadges(profile.id);
    });

  modalBody()
    .querySelectorAll<HTMLButtonElement>("button[data-notif-id]")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", btn.dataset.notifId!);
        closeModal();
        refreshNotifBadges(profile.id);
        const link = btn.dataset.notifLink;
        if (link) navigate(link);
      });
    });
}

export function renderPortalShell(profile: Profile, activePath: string): HTMLElement {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  const navItems = navItemsForRole(profile.role);
  const collapsed = isCollapsed();

  const items = navItems
    .map((item) => {
      const isActive = activePath === item.path;
      return `<a href="${item.path}" data-link title="${item.label}"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive ? "bg-secondary text-secondary-ink" : "text-primary-ink/70 hover:bg-primary-ink/10 hover:text-primary-ink"
        }"><span class="nav-icon">${icon(item.icon)}</span><span class="collapsible-label truncate">${item.label}</span></a>`;
    })
    .join("");

  app.innerHTML = `
    <div class="min-h-screen flex bg-accent dark:bg-slate-950 font-sans">
      <div id="sidebar-overlay" class="fixed inset-0 bg-black/40 z-30 hidden md:hidden"></div>
      <aside id="portal-sidebar" class="fixed md:relative inset-y-0 left-0 z-40 w-56 shrink-0 bg-primary flex flex-col -translate-x-full md:translate-x-0 transition-transform md:transition-[width] duration-150 overflow-hidden">
        <div class="absolute -top-16 -right-12 w-44 h-44 rounded-full bg-secondary/20 blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-20 -left-12 w-52 h-52 rounded-full bg-secondary/10 blur-3xl pointer-events-none"></div>
        <div id="sidebar-header" class="relative px-4 py-4 border-b border-white/10 flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div id="brand-logo-slot" class="mb-1.5 h-6"></div>
            <p id="brand-name" class="text-primary-ink font-semibold text-sm collapsible-label truncate">GR Immo Suite</p>
            <p class="text-primary-ink/50 text-xs collapsible-label truncate">${PORTAL_LABEL[profile.role]}</p>
          </div>
          <button id="mobile-sidebar-close" aria-label="Fermer le menu" title="Fermer le menu"
            class="md:hidden shrink-0 text-primary-ink/70 hover:text-primary-ink hover:bg-primary-ink/10 rounded-md p-1 -mr-1 -mt-1">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <nav class="relative flex-1 p-3 space-y-1 overflow-y-auto">${items}</nav>
        <div class="relative p-3 border-t border-white/10 space-y-2">
          <button id="notif-btn-desktop" title="Notifications"
            class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-primary-ink/70 hover:bg-primary-ink/10 hover:text-primary-ink transition-colors">
            <span class="nav-icon relative">
              <svg class="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${BELL_ICON}</svg>
              <span class="notif-badge hidden absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-danger text-white text-[9px] leading-[15px] text-center">0</span>
            </span>
            <span class="collapsible-label">Notifications</span>
          </button>
          <button id="theme-toggle" title="Changer de thème"
            class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-primary-ink/70 hover:bg-primary-ink/10 hover:text-primary-ink transition-colors">
            <span id="theme-icon" class="nav-icon"></span>
            <span class="collapsible-label">Thème</span>
          </button>
          <button id="collapse-toggle" title="Réduire / agrandir"
            class="hidden md:flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-primary-ink/70 hover:bg-primary-ink/10 hover:text-primary-ink transition-colors">
            <span class="nav-icon">
              <svg id="collapse-chevron" class="w-[18px] h-[18px] shrink-0 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </span>
            <span class="collapsible-label">Réduire</span>
          </button>
          <div id="profile-block" class="pt-1">
            <p class="text-xs text-primary-ink/60 truncate collapsible-label">${profile.full_name}</p>
            <button id="logout" class="flex items-center gap-3 text-xs text-primary-ink/80 hover:text-primary-ink transition-colors w-full px-1 py-1">
              <span class="nav-icon"><svg class="w-[16px] h-[16px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
              <span class="collapsible-label hover:underline">Déconnexion</span>
            </button>
          </div>
        </div>
      </aside>
      <div class="flex-1 min-w-0 flex flex-col">
        <div id="mobile-topbar" class="flex md:hidden items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button id="mobile-menu-btn" aria-label="Ouvrir le menu" class="text-slate-700 dark:text-slate-200">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MENU_ICON}</svg>
          </button>
          <button id="notif-btn-mobile" aria-label="Notifications" class="relative text-slate-700 dark:text-slate-200">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${BELL_ICON}</svg>
            <span class="notif-badge hidden absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-danger text-white text-[9px] leading-[15px] text-center">0</span>
          </button>
        </div>
        <main id="page-content" class="p-6 flex-1"></main>
      </div>
    </div>
  `;

  const sidebar = app.querySelector<HTMLElement>("#portal-sidebar")!;
  const header = app.querySelector<HTMLElement>("#sidebar-header")!;
  const chevron = app.querySelector<SVGElement>("#collapse-chevron")!;
  const overlay = app.querySelector<HTMLElement>("#sidebar-overlay")!;

  function applyCollapsedState(state: boolean) {
    sidebar.classList.toggle("md:w-56", !state);
    sidebar.classList.toggle("md:w-16", state);
    header.classList.toggle("justify-center", state);
    header.classList.toggle("px-0", state);
    chevron.classList.toggle("rotate-180", state);
    app.querySelectorAll<HTMLElement>(".collapsible-label").forEach((el) => el.classList.toggle("hidden", state));
  }
  applyCollapsedState(collapsed);

  function openMobileSidebar() {
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.remove("hidden");
  }
  function closeMobileSidebar() {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("hidden");
  }
  app.querySelector<HTMLButtonElement>("#mobile-menu-btn")!.addEventListener("click", openMobileSidebar);
  app.querySelector<HTMLButtonElement>("#mobile-sidebar-close")!.addEventListener("click", closeMobileSidebar);
  overlay.addEventListener("click", closeMobileSidebar);
  sidebar.querySelectorAll<HTMLAnchorElement>("nav a[data-link]").forEach((a) => a.addEventListener("click", closeMobileSidebar));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sidebar.classList.contains("-translate-x-full")) closeMobileSidebar();
  });

  refreshNotifBadges(profile.id);
  app.querySelector<HTMLButtonElement>("#notif-btn-desktop")!.addEventListener("click", () => openNotificationsModal(profile));
  app.querySelector<HTMLButtonElement>("#notif-btn-mobile")!.addEventListener("click", () => openNotificationsModal(profile));

  const brandNameEl = app.querySelector<HTMLElement>("#brand-name")!;
  const brandLogoSlot = app.querySelector<HTMLElement>("#brand-logo-slot")!;
  loadSidebarBranding(profile.organization_id, brandNameEl, brandLogoSlot);

  function renderThemeIcon() {
    const iconEl = app.querySelector<HTMLSpanElement>("#theme-icon")!;
    const scheme = getColorScheme();
    iconEl.innerHTML =
      scheme === "dark"
        ? '<svg class="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg class="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>';
  }
  renderThemeIcon();

  app.querySelector<HTMLButtonElement>("#theme-toggle")!.addEventListener("click", () => {
    toggleColorScheme();
    renderThemeIcon();
  });

  app.querySelector<HTMLButtonElement>("#collapse-toggle")!.addEventListener("click", () => {
    const next = !isCollapsed();
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    applyCollapsedState(next);
  });

  app.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
    await signOut();
    navigate("/login", { replace: true });
  });

  return app.querySelector<HTMLElement>("#page-content")!;
}
