import { bindings } from "./bindings";
import { en } from "./locales/en";
import { es } from "./locales/es";

export type Locale = "es" | "en";

const STORAGE_KEY = "ocote_locale";
const locales = { es, en };

type MessageTree = Record<string, unknown>;
function getMessage(tree: MessageTree, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in node) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, tree);
  return typeof value === "string" ? value : undefined;
}

export function t(key: string, locale: Locale): string {
  return getMessage(locales[locale], key) ?? getMessage(es, key) ?? key;
}

function updateMeta(locale: Locale) {
  const m = locales[locale].meta;
  document.title = m.title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", m.description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", m.ogTitle);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", m.ogDescription);
  document.querySelector('meta[property="og:locale"]')?.setAttribute(
    "content",
    locale === "en" ? "en_GB" : "es_ES",
  );
  document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", m.ogTitle);
  document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", m.twitterDescription);
}

function updateLangSwitcher(locale: Locale) {
  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((btn) => {
    const active = btn.dataset.lang === locale;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

export function getLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en") return "en";
  if (stored === "es") return "es";

  const queryLang = new URLSearchParams(window.location.search).get("lang");
  if (queryLang === "en") return "en";

  return "es";
}

function applyBindings(locale: Locale) {
  for (const binding of bindings) {
    const el = document.querySelector<HTMLElement>(binding.selector);
    if (!el) continue;

    const value = t(binding.key, locale);
    if (binding.type === "text") {
      el.textContent = value;
    } else if (binding.type === "html") {
      el.innerHTML = value;
    } else {
      el.setAttribute(binding.attr, value);
    }
  }

  document.querySelectorAll("#menu-vinos small").forEach((el) => {
    el.textContent = t("menu.wine.bottleSuffix", locale);
  });

  const footerLegal = document.querySelector(".site-footer__legal");
  if (footerLegal) {
    const year = String(new Date().getFullYear());
    footerLegal.innerHTML = `© <span data-year>${year}</span> Ocote. ${t("footer.madeWith", locale)}`;
  }
}

export function applyLocale(locale: Locale) {
  document.documentElement.lang = locale;
  applyBindings(locale);
  updateMeta(locale);
  updateLangSwitcher(locale);
  localStorage.setItem(STORAGE_KEY, locale);
}
let currentLocale: Locale = "es";

export function initI18n() {
  currentLocale = getLocale();
  applyLocale(currentLocale);

  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.lang as Locale | undefined;
      if (!next || next === currentLocale) return;
      currentLocale = next;
      applyLocale(next);
    });
  });
}