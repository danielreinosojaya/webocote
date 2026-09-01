import { getCurrentLocale, LOCALE_EVENT, type Locale } from "./i18n";

const IFRAME_RESIZER_SRC =
  "https://www.covermanager.com/js/iframeResizer/iframeResizer.min.js";

const COVER_URLS: Record<Locale, string> = {
  es: "https://www.covermanager.com/reservation/module_restaurant/restaurante-ocote/spanish",
  en: "https://www.covermanager.com/reservation/module_restaurant/restaurante-ocote/english",
};

let scriptPromise: Promise<void> | null = null;

function loadIframeResizer(): Promise<void> {
  if (window.iFrameResize) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${IFRAME_RESIZER_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("iframeResizer")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = IFRAME_RESIZER_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("iframeResizer"));
    };
    document.head.append(script);
  });

  return scriptPromise;
}

function bindResizer(iframe: HTMLIFrameElement) {
  if (iframe.dataset.resized === "true") return;
  window.iFrameResize?.(
    {
      checkOrigin: false,
      heightCalculationMethod: "lowestElement",
    },
    iframe,
  );
  iframe.dataset.resized = "true";
}

export function initCoverManager(opts: { onOpen?: () => void; onClose?: () => void } = {}) {
  const modal = document.getElementById("cover-modal") as HTMLDialogElement | null;
  const iframe = document.getElementById("restaurante-ocote") as HTMLIFrameElement | null;
  const openers = document.querySelectorAll("[data-cover-open]");
  if (!modal || !iframe || !openers.length) return;

  const setSrcForLocale = (locale: Locale) => {
    const next = COVER_URLS[locale];
    if (iframe.getAttribute("src") === next) return;
    iframe.src = next;
  };

  const open = () => {
    opts.onOpen?.();
    document.body.classList.add("is-cover-open");
    setSrcForLocale(getCurrentLocale());
    if (typeof modal.showModal === "function") {
      if (!modal.open) modal.showModal();
    } else {
      modal.setAttribute("open", "");
    }
    void loadIframeResizer()
      .then(() => bindResizer(iframe))
      .catch(() => {
        /* The widget still works at the fallback height. */
      });
  };

  const close = () => {
    if (typeof modal.close === "function") {
      if (modal.open) modal.close();
    } else {
      modal.removeAttribute("open");
    }
  };

  const onClosed = () => {
    document.body.classList.remove("is-cover-open");
    opts.onClose?.();
  };

  iframe.addEventListener("load", () => {
    if (!iframe.getAttribute("src")) return;
    if (window.iFrameResize) bindResizer(iframe);
  });

  openers.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    });
  });

  modal.querySelectorAll("[data-cover-close]").forEach((el) => {
    el.addEventListener("click", () => close());
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  modal.addEventListener("close", onClosed);

  document.addEventListener(LOCALE_EVENT, ((e: CustomEvent<Locale>) => {
    if (!iframe.getAttribute("src") && !modal.open) return;
    setSrcForLocale(e.detail);
  }) as EventListener);
}
