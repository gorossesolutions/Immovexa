import { getCurrentProfile, homeForRole, signInWithMagicLink, signInWithPassword } from "../lib/auth";
import { getCurrentBranding } from "../lib/theme";
import { navigate } from "../router";

export async function renderLogin() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  const branding = getCurrentBranding();
  const logoHtml = branding?.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.displayName}" class="h-10 w-auto object-contain mx-auto mb-2" />`
    : "";

  const buildings = [
    [20, 40, 70], [70, 30, 100], [110, 50, 60], [170, 35, 130], [215, 45, 80],
    [270, 30, 110], [310, 55, 65], [375, 40, 95], [425, 30, 140], [465, 50, 75],
    [525, 35, 105], [570, 45, 85], [625, 30, 120], [665, 55, 70], [730, 40, 100],
  ]
    .map(([x, w, h]) => `<rect x="${x}" y="${160 - h}" width="${w}" height="${h}" />`)
    .join("");

  app.innerHTML = `
    <div class="min-h-screen flex font-sans">
      <div class="w-full lg:w-[440px] xl:w-[480px] shrink-0 flex items-center justify-center bg-white dark:bg-slate-950 px-4 sm:px-8 py-12">
        <div class="w-full max-w-sm space-y-6">
          <div class="space-y-1">
            ${logoHtml}
            <h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">${branding?.displayName ?? "GR Immo Suite"}</h1>
            <p class="text-sm text-slate-500 dark:text-slate-400">Connectez-vous à votre espace</p>
          </div>
          <form id="login-form" class="space-y-4" novalidate>
            <div>
              <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1" for="email">Email</label>
              <input id="email" type="email" required autocomplete="email"
                class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary" />
            </div>
            <div>
              <label class="block text-sm text-slate-500 dark:text-slate-400 mb-1" for="password">Mot de passe</label>
              <input id="password" type="password" required autocomplete="current-password"
                class="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary" />
            </div>
            <p id="error" class="text-sm text-red-600 dark:text-red-400 hidden"></p>
            <button type="submit" id="submit-btn"
              class="w-full rounded-md bg-secondary text-secondary-ink text-sm font-medium py-2 hover:opacity-90 transition disabled:opacity-60">
              Se connecter
            </button>
          </form>
          <button id="magic-link" type="button" class="w-full text-sm text-secondary-fg dark:text-secondary-fg-dark hover:underline">
            Recevoir un lien de connexion par email
          </button>
          <p id="magic-link-sent" class="text-sm text-center text-slate-500 dark:text-slate-400 hidden">
            Lien envoyé — vérifiez votre boîte mail.
          </p>
        </div>
      </div>

      <div class="hidden lg:flex flex-1 relative overflow-hidden bg-primary items-center justify-center p-12">
        <div class="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-secondary/30 blur-3xl"></div>
        <div class="absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full bg-accent/20 blur-3xl"></div>
        <div class="absolute top-1/4 right-10 w-56 h-56 rounded-full bg-secondary/20 blur-2xl"></div>
        <svg class="absolute bottom-0 left-0 w-full h-40 text-primary-ink/10" viewBox="0 0 800 160" preserveAspectRatio="none" fill="currentColor">${buildings}</svg>

        <div class="relative z-10 max-w-md space-y-8">
          <div class="space-y-2">
            <h2 class="text-2xl font-semibold text-primary-ink leading-snug">Toute votre gestion locative,<br />réunie au même endroit.</h2>
            <p class="text-sm text-primary-ink/70">Biens, baux, paiements et documents — pilotés depuis un seul tableau de bord.</p>
          </div>

          <div class="bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-2xl shadow-2xl p-5">
            <div class="flex items-center gap-1.5 mb-4">
              <span class="w-2.5 h-2.5 rounded-full bg-red-400"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            </div>
            <div class="grid grid-cols-3 gap-2 mb-4">
              <div class="bg-accent dark:bg-slate-800 rounded-lg p-2.5">
                <p class="text-[10px] text-slate-500 dark:text-slate-400">Baux actifs</p>
                <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">12</p>
              </div>
              <div class="bg-accent dark:bg-slate-800 rounded-lg p-2.5">
                <p class="text-[10px] text-slate-500 dark:text-slate-400">CA du mois</p>
                <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">184k</p>
              </div>
              <div class="bg-accent dark:bg-slate-800 rounded-lg p-2.5">
                <p class="text-[10px] text-slate-500 dark:text-slate-400">Occupation</p>
                <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">92%</p>
              </div>
            </div>
            <div class="space-y-2">
              <div class="h-2.5 rounded-full bg-secondary w-[85%]"></div>
              <div class="h-2.5 rounded-full bg-secondary/60 w-[60%]"></div>
              <div class="h-2.5 rounded-full bg-secondary/30 w-[70%]"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const form = app.querySelector<HTMLFormElement>("#login-form")!;
  const emailInput = app.querySelector<HTMLInputElement>("#email")!;
  const passwordInput = app.querySelector<HTMLInputElement>("#password")!;
  const errorEl = app.querySelector<HTMLParagraphElement>("#error")!;
  const submitBtn = app.querySelector<HTMLButtonElement>("#submit-btn")!;
  const magicLinkBtn = app.querySelector<HTMLButtonElement>("#magic-link")!;
  const magicLinkSent = app.querySelector<HTMLParagraphElement>("#magic-link-sent")!;

  function showError(message: string) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    submitBtn.disabled = true;

    const { error } = await signInWithPassword(emailInput.value.trim(), passwordInput.value);
    if (error) {
      submitBtn.disabled = false;
      showError("Email ou mot de passe incorrect.");
      return;
    }

    const profile = await getCurrentProfile();
    navigate(profile ? homeForRole(profile.role) : "/login", { replace: true });
  });

  magicLinkBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      showError("Entrez votre email pour recevoir un lien.");
      return;
    }
    errorEl.classList.add("hidden");
    magicLinkBtn.disabled = true;
    await signInWithMagicLink(email);
    magicLinkSent.classList.remove("hidden");
  });
}
