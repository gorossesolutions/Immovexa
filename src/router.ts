import { getCurrentProfile, homeForRole, signOut, type Role } from "./lib/auth";
import { hasEntitlement } from "./lib/entitlements";

type RouteRoles = "public" | "auth" | Role[];

interface Route {
  path: string;
  roles: RouteRoles;
  entitlement?: string;
  render: (params: Record<string, string>) => void | Promise<void>;
}

const routes: Route[] = [];

export function registerRoute(route: Route) {
  routes.push(route);
}

function matchRoute(pathname: string): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    const paramNames: string[] = [];
    const pattern = route.path.replace(/:[^/]+/g, (segment) => {
      paramNames.push(segment.slice(1));
      return "([^/]+)";
    });
    const match = pathname.match(new RegExp(`^${pattern}$`));
    if (match) {
      const params: Record<string, string> = {};
      paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
      return { route, params };
    }
  }
  return null;
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) {
    window.history.replaceState({}, "", path);
  } else {
    window.history.pushState({}, "", path);
  }
  handleRoute();
}

function renderLoading() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-accent dark:bg-slate-950 font-sans">
      <p class="text-slate-500 dark:text-slate-400 text-sm">Chargement…</p>
    </div>
  `;
}

async function handleRoute() {
  const pathname = window.location.pathname;
  const matched = matchRoute(pathname);

  renderLoading();
  const profile = await getCurrentProfile();

  if (!matched) {
    navigate(profile ? homeForRole(profile.role) : "/login", { replace: true });
    return;
  }

  const { route, params } = matched;

  if (route.roles === "public") {
    if (profile) {
      navigate(homeForRole(profile.role), { replace: true });
      return;
    }
  } else {
    if (!profile) {
      navigate("/login", { replace: true });
      return;
    }
    if (route.roles !== "auth" && !route.roles.includes(profile.role)) {
      navigate(homeForRole(profile.role), { replace: true });
      return;
    }
    if (route.entitlement && !(await hasEntitlement(profile.organization_id, route.entitlement))) {
      const fallback = homeForRole(profile.role);
      if (pathname === fallback) {
        // Même la route "home" de ce rôle est gated et indisponible pour ce
        // plan : il n'y a nulle part où rediriger sans boucler, on déconnecte.
        await signOut();
        navigate("/login", { replace: true });
        return;
      }
      navigate(fallback, { replace: true });
      return;
    }
  }

  await route.render(params);
}

export function initRouter() {
  window.addEventListener("popstate", handleRoute);
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-link]");
    if (link) {
      e.preventDefault();
      navigate(link.getAttribute("href")!);
    }
  });
  handleRoute();
}
