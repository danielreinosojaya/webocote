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

function enableGoogleAnalytics() {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
  if (!measurementId || document.getElementById("ocote-ga4")) return;

  const script = document.createElement("script");
  script.id = "ocote-ga4";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);

  window.dataLayer = window.dataLayer ?? [];
  const gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  gtag("js", new Date());
  gtag("config", measurementId, { anonymize_ip: true });
}

function enableMetaPixel() {
  const pixelId = import.meta.env.VITE_META_PIXEL_ID?.trim();
  if (!pixelId || !/^\d+$/.test(pixelId) || document.getElementById("ocote-meta-pixel")) return;

  const script = document.createElement("script");
  script.id = "ocote-meta-pixel";
  script.textContent = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`;
  document.head.append(script);

  const noscript = document.createElement("noscript");
  const img = document.createElement("img");
  img.height = 1;
  img.width = 1;
  img.style.display = "none";
  img.src = `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`;
  noscript.append(img);
  document.body.append(noscript);
}

function enableAnalytics() {
  document.documentElement.dataset.analytics = "enabled";
  enableGoogleAnalytics();
  enableMetaPixel();
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
