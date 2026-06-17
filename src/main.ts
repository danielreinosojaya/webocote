import Lenis from "lenis";
import { initCookieConsent } from "./cookies";
import "./style.css";

initCookieConsent();

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const prefersCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
const prefersNoHover = window.matchMedia("(hover: none)").matches;
const useLenis = !prefersReducedMotion && !prefersCoarsePointer && !prefersNoHover;

const header = document.querySelector<HTMLElement>("[data-header]");
const headerSpacer = document.querySelector<HTMLElement>("[data-header-spacer]");
const menuNav = document.querySelector<HTMLElement>("[data-menu-nav]");
const menuNavSentinel = document.querySelector<HTMLElement>("[data-menu-nav-sentinel]");
const parallaxWrap = document.querySelector<HTMLElement>("[data-parallax-wrap]");
const parallaxImg = parallaxWrap?.querySelector<HTMLImageElement>("[data-parallax]");
const yearEl = document.querySelector<HTMLElement>("[data-year]");

if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

/* Smooth scroll (desktop pointer only — touch usa scroll nativo) */
let lenis: Lenis | null = null;
if (useLenis) {
  lenis = new Lenis({
    duration: 1.15,
    smoothWheel: true,
    wheelMultiplier: 0.95,
    touchMultiplier: 1.05,
  });

  function raf(time: number) {
    lenis?.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}

/* Header + layout */
function updateHeader() {
  if (!header) return;
  const y = lenis ? lenis.animatedScroll : window.scrollY;
  header.classList.toggle("is-scrolled", y > 32);
}

function updateLayoutVars() {
  if (header) {
    const height = header.offsetHeight;
    document.documentElement.style.setProperty("--header-offset", `${height}px`);
    if (headerSpacer && window.matchMedia("(max-width: 899px)").matches) {
      headerSpacer.style.height = `${height}px`;
    }
  }
  if (menuNav) {
    document.documentElement.style.setProperty("--menu-nav-offset", `${menuNav.offsetHeight}px`);
  }
}

function updateMenuNavStuck() {
  if (!menuNav || !menuNavSentinel || !header) return;
  const inset = header.offsetHeight;
  menuNav.classList.toggle("is-stuck", menuNavSentinel.getBoundingClientRect().top <= inset);
}

function onScroll() {
  updateHeader();
  updateMenuNavStuck();
}

if (lenis) {
  lenis.on("scroll", onScroll);
} else {
  window.addEventListener("scroll", onScroll, { passive: true });
}

updateLayoutVars();
window.addEventListener("resize", updateLayoutVars, { passive: true });
document.fonts?.ready.then(updateLayoutVars);
onScroll();

function getScrollOffset(el: HTMLElement) {
  const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop);
  return Number.isFinite(margin) && margin > 0 ? -margin : -72;
}

function scrollToTarget(el: HTMLElement) {
  const offset = getScrollOffset(el);
  if (lenis) {
    lenis.scrollTo(el, { offset });
  } else {
    const top = el.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({
      top,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }
}

/* In-page anchors respect fixed header + Lenis */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    const href = anchor.getAttribute("href");
    if (!href || href === "#") return;
    const id = href.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    scrollToTarget(el);
  });
});

/* Menu section chips — active state while scrolling */
const menuSections = Array.from(
  document.querySelectorAll<HTMLElement>("[data-menu-section]"),
);
const menuChips = Array.from(document.querySelectorAll<HTMLAnchorElement>(".menu-nav__chip"));

function getMenuSpyInset() {
  const headerHeight = header?.offsetHeight ?? 72;
  const navHeight = menuNav?.offsetHeight ?? 44;
  return headerHeight + navHeight + 12;
}

function updateMenuNavActive() {
  if (!menuSections.length || !menuChips.length) return;

  const menu = document.getElementById("menu");
  if (!menu) return;

  const inset = getMenuSpyInset();
  const menuRect = menu.getBoundingClientRect();

  if (menuRect.top > inset) {
    menuChips.forEach((chip) => chip.classList.remove("is-active"));
    return;
  }

  let currentId = menuSections[0]?.id ?? "";

  for (const section of menuSections) {
    if (section.getBoundingClientRect().top <= inset) {
      currentId = section.id;
    }
  }

  for (const chip of menuChips) {
    chip.classList.toggle("is-active", chip.getAttribute("href") === `#${currentId}`);
  }
}

if (menuSections.length) {
  const onMenuSpy = () => updateMenuNavActive();
  if (lenis) {
    lenis.on("scroll", onMenuSpy);
  } else {
    window.addEventListener("scroll", onMenuSpy, { passive: true });
  }
  window.addEventListener("resize", onMenuSpy, { passive: true });
  onMenuSpy();
}

/* Scroll reveals */
const revealEls = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      (e.target as HTMLElement).classList.add("is-visible");
      io.unobserve(e.target);
    }
  },
  { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
);
for (const el of revealEls) {
  io.observe(el);
}

/* Subtle parallax on hero-adjacent image */
const parallaxStrength = Number(parallaxImg?.dataset.parallax ?? "0");

function updateParallax() {
  if (!parallaxWrap || !parallaxImg || prefersReducedMotion || !parallaxStrength) return;
  const rect = parallaxWrap.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  const progress = (rect.top + rect.height * 0.35) / (vh + rect.height);
  const y = (0.5 - Math.min(1, Math.max(0, progress))) * 40 * parallaxStrength * 10;
  parallaxImg.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(1.04)`;
}

if (lenis) {
  lenis.on("scroll", updateParallax);
} else {
  window.addEventListener("scroll", updateParallax, { passive: true });
}
updateParallax();
