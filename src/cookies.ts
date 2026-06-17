export type CookieConsent = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  updatedAt: string;
};

const STORAGE_KEY = "ocote_cookie_v1";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Syne:wght@400;500;600;700&display=swap";

function readConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.necessary !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeConsent(consent: CookieConsent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
}

function loadDisplayFonts() {
  if (document.getElementById("ocote-google-fonts")) return;
  const pre1 = document.createElement("link");
  pre1.rel = "preconnect";
  pre1.href = "https://fonts.googleapis.com";
  const pre2 = document.createElement("link");
  pre2.rel = "preconnect";
  pre2.href = "https://fonts.gstatic.com";
  pre2.crossOrigin = "anonymous";
  const link = document.createElement("link");
  link.id = "ocote-google-fonts";
  link.rel = "stylesheet";
  link.href = FONTS_HREF;
  document.head.append(pre1, pre2, link);
}

function enableAnalytics() {
  document.documentElement.dataset.analytics = "enabled";
}

function applyConsent(consent: CookieConsent) {
  document.documentElement.dataset.cookieConsent = "set";
  if (consent.preferences) loadDisplayFonts();
  if (consent.analytics) enableAnalytics();
}

export function openCookieSettings() {
  const existing = readConsent();
  const prefToggle = document.getElementById("cookie-pref-toggle") as HTMLInputElement | null;
  const analyticsToggle = document.getElementById("cookie-analytics-toggle") as HTMLInputElement | null;
  if (existing) {
    if (prefToggle) prefToggle.checked = existing.preferences;
    if (analyticsToggle) analyticsToggle.checked = existing.analytics;
  }
  document.getElementById("cookie-modal")?.removeAttribute("hidden");
  document.getElementById("cookie-banner")?.setAttribute("hidden", "");
}

export function initCookieConsent() {
  const banner = document.getElementById("cookie-banner");
  const modal = document.getElementById("cookie-modal");
  if (!banner || !modal) return;

  const btnAccept = document.getElementById("cookie-accept-all");
  const btnReject = document.getElementById("cookie-reject-optional");
  const btnSettings = document.getElementById("cookie-open-settings");
  const btnSave = document.getElementById("cookie-save-settings");
  const btnClose = document.getElementById("cookie-close-settings");
  const prefToggle = document.getElementById("cookie-pref-toggle") as HTMLInputElement | null;
  const analyticsToggle = document.getElementById("cookie-analytics-toggle") as HTMLInputElement | null;

  const save = (preferences: boolean, analytics: boolean) => {
    const consent: CookieConsent = {
      necessary: true,
      preferences,
      analytics,
      updatedAt: new Date().toISOString(),
    };
    writeConsent(consent);
    applyConsent(consent);
    if (prefToggle) prefToggle.checked = preferences;
    if (analyticsToggle) analyticsToggle.checked = analytics;
    banner.setAttribute("hidden", "");
    modal.setAttribute("hidden", "");
  };

  btnAccept?.addEventListener("click", () => save(true, true));
  btnReject?.addEventListener("click", () => save(false, false));
  btnSettings?.addEventListener("click", openCookieSettings);
  btnClose?.addEventListener("click", () => modal.setAttribute("hidden", ""));
  btnSave?.addEventListener("click", () => {
    save(Boolean(prefToggle?.checked), Boolean(analyticsToggle?.checked));
  });

  document.querySelectorAll("[data-cookie-settings]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openCookieSettings();
    });
  });

  const existing = readConsent();
  if (existing) {
    applyConsent(existing);
    if (prefToggle) prefToggle.checked = existing.preferences;
    if (analyticsToggle) analyticsToggle.checked = existing.analytics;
    return;
  }

  banner.removeAttribute("hidden");
}
