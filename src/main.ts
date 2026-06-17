import Lenis from "lenis";
import { initCookieConsent } from "./cookies";
import "./style.css";

initCookieConsent();

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const header = document.querySelector<HTMLElement>("[data-header]");
const parallaxWrap = document.querySelector<HTMLElement>("[data-parallax-wrap]");
const parallaxImg = parallaxWrap?.querySelector<HTMLImageElement>("[data-parallax]");
const yearEl = document.querySelector<HTMLElement>("[data-year]");

if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

/* Smooth scroll */
let lenis: Lenis | null = null;
if (!prefersReducedMotion) {
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

/* Header state */
function updateHeader() {
  if (!header) return;
  const y = lenis ? lenis.animatedScroll : window.scrollY;
  header.classList.toggle("is-scrolled", y > 32);
}

if (lenis) {
  lenis.on("scroll", updateHeader);
} else {
  window.addEventListener("scroll", updateHeader, { passive: true });
}
updateHeader();

/* In-page anchors respect fixed header + Lenis */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    const href = anchor.getAttribute("href");
    if (!href || href === "#") return;
    const id = href.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    if (lenis) {
      lenis.scrollTo(el, { offset: -72 });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

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
