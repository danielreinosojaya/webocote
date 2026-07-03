import "./compras.css";
import {
  isImageFile,
  isPdfFile,
  processImageFile,
  processPdfFile,
  type PdfProcessResult,
} from "./pdf-client";
import { parseAlbaranText } from "./parse-albaran";
import { ocrImages } from "./ocr-client";

type Vista = "subir" | "albaranes" | "resumen";

const STORAGE_PERIODO = "ocote_compras_periodo";

interface Insumo {
  id: number;
  nombre: string;
  unidad: string;
  categoria: string | null;
}

interface LineaExtraida {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  total: number | null;
  insumo_id: number | null;
  insumo_nombre: string;
  _editing?: boolean;
}

interface LineaGuardada {
  id: number;
  descripcion_original: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  total: number | null;
  insumo_id: number | null;
  insumo_nombre: string | null;
}

interface AlbaranDetalle {
  id: number;
  proveedor_nombre: string;
  fecha: string;
  numero: string | null;
}

interface AlbaranExtraido {
  proveedor: string;
  fecha: string | null;
  numero: string | null;
  lineas: LineaExtraida[];
  confianza: "alta" | "media" | "baja";
  metodo: "texto" | "ocr";
  notas: string | null;
}

interface Albaran {
  id: number;
  proveedor_nombre: string;
  fecha: string;
  numero: string | null;
  estado: string;
  lineas_count: number;
  total_importe: number;
  metodo_extraccion: string | null;
}

interface ResumenItem {
  insumo_id: number | null;
  insumo_nombre: string;
  unidad: string;
  cantidad_total: number;
  gasto_total: number;
  num_lineas: number;
}

const app = document.getElementById("app")!;
const informePrint = document.getElementById("informe-print")!;
const LOGO_URL = "/web/media/logo-dark.png";

let vista: Vista = "subir";
let mesActual = loadPeriodo();
let pinBuffer = "";
let insumos: Insumo[] = [];
let albaranes: Albaran[] = [];
let resumen: ResumenItem[] = [];
let totales = { num_albaranes: 0, gasto_total: 0, num_lineas: 0 };
let periodoDesde = monthBounds(loadPeriodo()).desde;
let periodoHasta = monthBounds(loadPeriodo()).hasta;

let extraccion: AlbaranExtraido | null = null;
let pdfInfo: PdfProcessResult | null = null;
let subiendo = false;
let subiendoMensaje = "";
let archivoNombre = "";
let albaranDetalle: { albaran: AlbaranDetalle; lineas: LineaGuardada[] } | null = null;
let editingSavedLineaId: number | null = null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Error de conexion");
  }
  return data as T;
}

function loadPeriodo(): string {
  const saved = localStorage.getItem(STORAGE_PERIODO);
  if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved;
  return isoDate(new Date()).slice(0, 7);
}

function savePeriodo(ym: string): void {
  mesActual = ym;
  localStorage.setItem(STORAGE_PERIODO, ym);
  const b = monthBounds(ym);
  periodoDesde = b.desde;
  periodoHasta = b.hasta;
  albaranDetalle = null;
  editingSavedLineaId = null;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthBounds(ym: string): { desde: string; hasta: string } {
  const [y, m] = ym.split("-").map(Number);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { desde, hasta };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function confianzaLabel(c: string): string {
  if (c === "alta") return "Alta";
  if (c === "baja") return "Baja";
  return "Media";
}

function metodoLabel(m: string): string {
  if (m === "ocr") return "Escaneado (OCR)";
  return "Texto PDF";
}

function renderInsumoSelect(name: string, insumoId: number | null): string {
  return `
    <select class="linea-input" name="${name}">
      <option value="">Sin asignar</option>
      ${insumos
        .map(
          (ins) =>
            `<option value="${ins.id}"${insumoId === ins.id ? " selected" : ""}>${escapeHtml(ins.nombre)}</option>`,
        )
        .join("")}
      <option value="__new__"${insumoId === null ? "" : ""}>+ Nuevo insumo</option>
    </select>
  `;
}

function renderLineaCardDraft(l: LineaExtraida, i: number): string {
  if (l._editing) {
    return `
      <article class="linea-card linea-card--editing" data-draft-idx="${i}">
        <div class="linea-card__fields">
          <label class="linea-field linea-field--wide">
            <span>Descripcion</span>
            <input class="linea-input" name="desc" value="${escapeHtml(l.descripcion)}" />
          </label>
          <label class="linea-field">
            <span>Cant.</span>
            <input class="linea-input" name="cant" type="number" step="0.001" min="0" value="${l.cantidad}" />
          </label>
          <label class="linea-field">
            <span>Ud.</span>
            <input class="linea-input" name="ud" value="${escapeHtml(l.unidad)}" />
          </label>
          <label class="linea-field">
            <span>P. unit.</span>
            <input class="linea-input" name="pu" type="number" step="0.01" min="0" value="${l.precio_unitario ?? ""}" placeholder="-" />
          </label>
          <label class="linea-field">
            <span>Total</span>
            <input class="linea-input" name="tot" type="number" step="0.01" min="0" value="${l.total ?? ""}" placeholder="-" />
          </label>
          <label class="linea-field linea-field--wide">
            <span>Insumo</span>
            ${renderInsumoSelect("insumo", l.insumo_id)}
          </label>
        </div>
        <div class="linea-card__actions">
          <button type="button" class="btn btn--primary btn--sm" data-draft-action="save" data-draft-idx="${i}">Guardar</button>
          <button type="button" class="btn btn--ghost btn--sm" data-draft-action="delete" data-draft-idx="${i}">Eliminar</button>
        </div>
      </article>
    `;
  }

  const insumoLabel = l.insumo_id
    ? insumos.find((ins) => ins.id === l.insumo_id)?.nombre ?? l.insumo_nombre
    : l.insumo_nombre || "Sin asignar";

  return `
    <article class="linea-card" data-draft-idx="${i}">
      <div class="linea-card__view">
        <p class="linea-card__desc">${escapeHtml(l.descripcion)}</p>
        <p class="linea-card__meta">
          ${l.cantidad} ${escapeHtml(l.unidad)}
          ${l.precio_unitario != null ? ` &middot; ${formatEuro(l.precio_unitario)}/ud` : ""}
          ${l.total != null ? ` &middot; <strong>${formatEuro(l.total)}</strong>` : ""}
        </p>
        <p class="linea-card__insumo">${escapeHtml(insumoLabel)}</p>
      </div>
      <div class="linea-card__actions">
        <button type="button" class="btn btn--ghost btn--sm" data-draft-action="edit" data-draft-idx="${i}">Editar</button>
        <button type="button" class="btn btn--ghost btn--sm linea-card__delete" data-draft-action="delete" data-draft-idx="${i}">Eliminar</button>
      </div>
    </article>
  `;
}

function renderLineaCardSaved(l: LineaGuardada): string {
  const editing = editingSavedLineaId === l.id;

  if (editing) {
    return `
      <article class="linea-card linea-card--editing" data-linea-id="${l.id}">
        <div class="linea-card__fields">
          <label class="linea-field linea-field--wide">
            <span>Descripcion</span>
            <input class="linea-input" name="desc" value="${escapeHtml(l.descripcion_original)}" />
          </label>
          <label class="linea-field">
            <span>Cant.</span>
            <input class="linea-input" name="cant" type="number" step="0.001" min="0" value="${l.cantidad}" />
          </label>
          <label class="linea-field">
            <span>Ud.</span>
            <input class="linea-input" name="ud" value="${escapeHtml(l.unidad)}" />
          </label>
          <label class="linea-field">
            <span>P. unit.</span>
            <input class="linea-input" name="pu" type="number" step="0.01" min="0" value="${l.precio_unitario ?? ""}" placeholder="-" />
          </label>
          <label class="linea-field">
            <span>Total</span>
            <input class="linea-input" name="tot" type="number" step="0.01" min="0" value="${l.total ?? ""}" placeholder="-" />
          </label>
          <label class="linea-field linea-field--wide">
            <span>Insumo</span>
            ${renderInsumoSelect("insumo", l.insumo_id)}
          </label>
        </div>
        <div class="linea-card__actions">
          <button type="button" class="btn btn--primary btn--sm" data-saved-action="save" data-linea-id="${l.id}">Guardar</button>
          <button type="button" class="btn btn--ghost btn--sm" data-saved-action="delete" data-linea-id="${l.id}">Eliminar</button>
        </div>
      </article>
    `;
  }

  return `
    <article class="linea-card" data-linea-id="${l.id}">
      <div class="linea-card__view">
        <p class="linea-card__desc">${escapeHtml(l.descripcion_original)}</p>
        <p class="linea-card__meta">
          ${l.cantidad} ${escapeHtml(l.unidad)}
          ${l.precio_unitario != null ? ` &middot; ${formatEuro(l.precio_unitario)}/ud` : ""}
          ${l.total != null ? ` &middot; <strong>${formatEuro(l.total)}</strong>` : ""}
        </p>
        <p class="linea-card__insumo">${l.insumo_nombre ? escapeHtml(l.insumo_nombre) : "Sin asignar"}</p>
      </div>
      <div class="linea-card__actions">
        <button type="button" class="btn btn--ghost btn--sm" data-saved-action="edit" data-linea-id="${l.id}">Editar</button>
        <button type="button" class="btn btn--ghost btn--sm linea-card__delete" data-saved-action="delete" data-linea-id="${l.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function readLineaFromCard(card: HTMLElement): {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  total: number | null;
  insumo_id: number | null;
  insumo_nombre: string | null;
} {
  const insumoVal = (card.querySelector('[name="insumo"]') as HTMLSelectElement)?.value ?? "";
  let insumo_id: number | null = null;
  let insumo_nombre: string | null = null;

  if (insumoVal === "__new__") {
    insumo_nombre = (card.querySelector('[name="desc"]') as HTMLInputElement)?.value.trim() ?? "";
  } else if (insumoVal) {
    insumo_id = Number(insumoVal);
  }

  const puRaw = (card.querySelector('[name="pu"]') as HTMLInputElement)?.value;
  const totRaw = (card.querySelector('[name="tot"]') as HTMLInputElement)?.value;

  return {
    descripcion: (card.querySelector('[name="desc"]') as HTMLInputElement)?.value.trim() ?? "",
    cantidad: Number((card.querySelector('[name="cant"]') as HTMLInputElement)?.value),
    unidad: (card.querySelector('[name="ud"]') as HTMLInputElement)?.value.trim() || "ud",
    precio_unitario: puRaw ? Number(puRaw) : null,
    total: totRaw ? Number(totRaw) : null,
    insumo_id,
    insumo_nombre,
  };
}

// --- Auth ---

function renderLogin(error = ""): void {
  const dots = Array.from({ length: 6 }, (_, i) => {
    const filled = i < pinBuffer.length;
    return `<span class="pin-dot${filled ? " pin-dot--filled" : ""}" aria-hidden="true"></span>`;
  }).join("");

  app.innerHTML = `
    <div class="compras-login">
      <header class="compras-login__brand">
        <img src="/web/svg/fuego.svg" alt="" width="32" height="32" />
        <div>
          <p class="compras-login__eyebrow">Ocote Madrid</p>
          <h1 class="compras-login__title">Control de compras</h1>
        </div>
      </header>
      <p class="compras-login__hint">Introduce el codigo de acceso</p>
      <div class="pin-display" aria-label="Codigo introducido">${dots}</div>
      ${error ? `<p class="compras-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <div class="pin-pad" role="group" aria-label="Teclado numerico">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
          .map((n) => `<button type="button" class="pin-key" data-pin="${n}">${n}</button>`)
          .join("")}
        <button type="button" class="pin-key pin-key--ghost" data-pin="clear">Borrar</button>
        <button type="button" class="pin-key" data-pin="0">0</button>
        <button type="button" class="pin-key pin-key--accent" data-pin="enter">Entrar</button>
      </div>
    </div>
  `;

  app.querySelectorAll<HTMLButtonElement>("[data-pin]").forEach((btn) => {
    btn.addEventListener("click", () => onPinKey(btn.dataset.pin!));
  });
}

function onPinKey(key: string): void {
  if (key === "clear") {
    pinBuffer = "";
    renderLogin();
    return;
  }
  if (key === "enter") {
    void submitPin();
    return;
  }
  if (pinBuffer.length < 6) {
    pinBuffer += key;
    renderLogin();
  }
}

async function submitPin(): Promise<void> {
  if (pinBuffer.length < 4) return;
  try {
    await api("/api/compras/login", {
      method: "POST",
      body: JSON.stringify({ pin: pinBuffer }),
    });
    pinBuffer = "";
    await loadApp();
  } catch (err) {
    pinBuffer = "";
    renderLogin(err instanceof Error ? err.message : "Codigo incorrecto");
  }
}

async function logout(): Promise<void> {
  await api("/api/compras/login", { method: "DELETE" });
  renderLogin();
}

// --- Data ---

async function loadInsumos(): Promise<void> {
  const data = await api<{ insumos: Insumo[] }>("/api/compras/insumos");
  insumos = data.insumos;
}

async function refreshData(): Promise<void> {
  const resumenData = await api<{
    resumen: ResumenItem[];
    totales: { num_albaranes: number; gasto_total: number; num_lineas: number };
    desde: string;
    hasta: string;
    periodo: string;
  }>(`/api/compras/resumen?mes=${mesActual}`);

  resumen = resumenData.resumen;
  totales = resumenData.totales;
  periodoDesde = resumenData.desde;
  periodoHasta = resumenData.hasta;
  updateInformePrint();

  if (vista === "albaranes") {
    const data = await api<{ albaranes: Albaran[] }>(`/api/compras/albaranes?mes=${mesActual}`);
    albaranes = data.albaranes;
    if (albaranDetalle) {
      const updated = albaranes.find((a) => a.id === albaranDetalle!.albaran.id);
      if (!updated) {
        albaranDetalle = null;
      } else {
        const detail = await api<{ albaran: AlbaranDetalle; lineas: LineaGuardada[] }>(
          `/api/compras/albaranes?id=${albaranDetalle.albaran.id}`,
        );
        albaranDetalle = detail;
      }
    }
  }
}

async function loadApp(): Promise<void> {
  const { authenticated } = await api<{ authenticated: boolean }>("/api/compras/session");
  if (!authenticated) {
    renderLogin();
    return;
  }
  await loadInsumos();
  await refreshData();
  renderShell();
}

// --- Shell ---

function renderShell(): void {
  app.innerHTML = `
    <header class="compras-header">
      <div class="compras-header__brand">
        <img src="/web/svg/fuego.svg" alt="" width="24" height="24" />
        <div>
          <p class="compras-header__eyebrow">Control de compras</p>
          <h1 class="compras-header__title">Coste de ventas</h1>
        </div>
      </div>
      <div class="compras-header__actions">
        <button type="button" class="btn btn--ghost btn--sm" data-action="logout">Salir</button>
      </div>
    </header>

    ${renderPeriodoBar()}

    <nav class="compras-tabs" aria-label="Vistas">
      <button type="button" class="compras-tabs__btn${vista === "subir" ? " is-active" : ""}" data-vista="subir">Subir</button>
      <button type="button" class="compras-tabs__btn${vista === "albaranes" ? " is-active" : ""}" data-vista="albaranes">Albaranes</button>
      <button type="button" class="compras-tabs__btn${vista === "resumen" ? " is-active" : ""}" data-vista="resumen">Coste ventas</button>
    </nav>

    <main class="compras-main">
      ${vista === "subir" ? renderSubir() : vista === "albaranes" ? renderAlbaranes() : renderResumen()}
    </main>
  `;

  app.querySelector('[data-action="logout"]')?.addEventListener("click", () => void logout());
  app.querySelectorAll<HTMLButtonElement>("[data-vista]").forEach((btn) => {
    btn.addEventListener("click", () => {
      vista = btn.dataset.vista as Vista;
      extraccion = null;
      pdfInfo = null;
      albaranDetalle = null;
      editingSavedLineaId = null;
      void switchVista();
    });
  });

  bindPeriodoEvents();

  if (vista === "subir") bindSubirEvents();
  else if (vista === "albaranes") bindAlbaranesEvents();
  else bindResumenEvents();
}

async function switchVista(): Promise<void> {
  await refreshData();
  renderShell();
}

function renderPeriodoBar(): string {
  return `
    <section class="periodo-bar" aria-label="Periodo contable">
      <div class="periodo-bar__selector">
        <button type="button" class="btn btn--ghost btn--sm" data-mes="prev" aria-label="Mes anterior">&larr;</button>
        <label class="periodo-bar__input-wrap">
          <span class="periodo-bar__label">Periodo</span>
          <input type="month" class="periodo-bar__input" id="periodo-input" value="${mesActual}" />
        </label>
        <button type="button" class="btn btn--ghost btn--sm" data-mes="next" aria-label="Mes siguiente">&rarr;</button>
      </div>
      <div class="periodo-bar__stats">
        <div class="periodo-stat">
          <span class="periodo-stat__value">${formatEuro(totales.gasto_total)}</span>
          <span class="periodo-stat__label">Compras del periodo</span>
        </div>
        <div class="periodo-stat">
          <span class="periodo-stat__value">${totales.num_albaranes}</span>
          <span class="periodo-stat__label">Albaranes</span>
        </div>
      </div>
    </section>
  `;
}

function bindPeriodoEvents(): void {
  app.querySelector('[data-mes="prev"]')?.addEventListener("click", () => {
    savePeriodo(shiftMonth(mesActual, -1));
    void switchVista();
  });
  app.querySelector('[data-mes="next"]')?.addEventListener("click", () => {
    savePeriodo(shiftMonth(mesActual, 1));
    void switchVista();
  });
  app.querySelector<HTMLInputElement>("#periodo-input")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    if (val && /^\d{4}-\d{2}$/.test(val)) {
      savePeriodo(val);
      void switchVista();
    }
  });
}

// --- Subir ---

function renderSubir(): string {
  if (extraccion) return renderRevision();

  return `
    <section class="upload-panel">
      <p class="periodo-hint">Los albaranes que subas se registraran en <strong>${formatMes(mesActual)}</strong></p>
      <div class="upload-drop" id="upload-drop">
        <input type="file" id="file-input" accept=".pdf,image/*" hidden />
        <div class="upload-drop__icon" aria-hidden="true">PDF</div>
        <p class="upload-drop__title">Sube un albaran</p>
        <p class="upload-drop__hint">PDF digital o escaneado (foto convertida a PDF). Tambien acepta JPG/PNG.</p>
        <button type="button" class="btn btn--primary" id="btn-select-file" ${subiendo ? "disabled" : ""}>
          ${subiendo ? "Procesando..." : "Seleccionar archivo"}
        </button>
      </div>
      ${subiendo ? `<p class="compras-status">${escapeHtml(subiendoMensaje || "Procesando documento...")}</p>` : ""}
      <p class="compras-legal">Revisa siempre los datos antes de guardar. La lectura automatica puede fallar: corrige o elimina lineas manualmente.</p>
    </section>
  `;
}

function renderRevision(): string {
  if (!extraccion) return "";

  const lineasHtml = extraccion.lineas.map((l, i) => renderLineaCardDraft(l, i)).join("");

  const previewHtml =
    pdfInfo?.pages.length && pdfInfo.esEscaneado
      ? `<div class="preview-pages">${pdfInfo.pages
          .slice(0, 2)
          .map((p) => `<img src="${p}" alt="Pagina del albaran" class="preview-page" />`)
          .join("")}</div>`
      : pdfInfo?.text
        ? `<details class="preview-text"><summary>Texto extraido del PDF</summary><pre>${escapeHtml(pdfInfo.text.slice(0, 2000))}</pre></details>`
        : "";

  return `
    <section class="revision-panel">
      <p class="periodo-hint">Se guardara en el periodo <strong>${formatMes(mesActual)}</strong></p>
      <div class="revision-meta">
        <span class="badge badge--${extraccion.confianza}">Confianza: ${confianzaLabel(extraccion.confianza)}</span>
        <span class="badge">${metodoLabel(extraccion.metodo)}</span>
        ${archivoNombre ? `<span class="badge badge--muted">${escapeHtml(archivoNombre)}</span>` : ""}
      </div>

      ${previewHtml}

      <form id="revision-form" class="revision-form">
        <div class="revision-fields">
          <label class="field">
            <span>Proveedor</span>
            <input name="proveedor" required value="${escapeHtml(extraccion.proveedor)}" />
          </label>
          <label class="field">
            <span>Fecha albaran</span>
            <input name="fecha" type="date" required value="${extraccion.fecha ?? periodoDesde}" />
          </label>
          <label class="field">
            <span>N. albaran</span>
            <input name="numero" value="${extraccion.numero ? escapeHtml(extraccion.numero) : ""}" placeholder="Opcional" />
          </label>
        </div>

        ${extraccion.notas ? `<p class="compras-alert">${escapeHtml(extraccion.notas)}</p>` : ""}

        <p class="lineas-hint">Elimina las lineas que no formen parte del coste de ventas (ej. comida del personal).</p>

        <div class="lineas-list" id="lineas-draft-list">
          ${lineasHtml || `<p class="compras-empty">Sin lineas. Anade una o vuelve a subir el albaran.</p>`}
        </div>

        <div class="revision-actions">
          <button type="button" class="btn btn--ghost" data-action="cancelar">Cancelar</button>
          <button type="button" class="btn btn--ghost" data-action="add-linea">+ Linea</button>
          <button type="submit" class="btn btn--primary" ${extraccion.lineas.length ? "" : "disabled"}>Guardar albaran</button>
        </div>
        <p class="compras-error compras-error--hidden" id="save-error" role="alert"></p>
      </form>
    </section>
  `;
}

function bindSubirEvents(): void {
  if (extraccion) {
    bindRevisionEvents();
    return;
  }

  const input = app.querySelector<HTMLInputElement>("#file-input");
  const drop = app.querySelector("#upload-drop");

  app.querySelector("#btn-select-file")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void handleFile(file);
  });

  drop?.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("upload-drop--active");
  });
  drop?.addEventListener("dragleave", () => drop.classList.remove("upload-drop--active"));
  drop?.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("upload-drop--active");
    const file = e.dataTransfer?.files[0];
    if (file) void handleFile(file);
  });
}

function bindRevisionEvents(): void {
  app.querySelector('[data-action="cancelar"]')?.addEventListener("click", () => {
    extraccion = null;
    pdfInfo = null;
    archivoNombre = "";
    renderShell();
  });

  app.querySelector('[data-action="add-linea"]')?.addEventListener("click", () => {
    if (!extraccion) return;
    extraccion.lineas.push({
      descripcion: "",
      cantidad: 1,
      unidad: "ud",
      precio_unitario: null,
      total: null,
      insumo_id: null,
      insumo_nombre: "",
      _editing: true,
    });
    renderShell();
  });

  app.querySelector("#lineas-draft-list")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-draft-action]");
    if (!btn || !extraccion) return;

    const action = btn.dataset.draftAction;
    const idx = Number(btn.dataset.draftIdx);
    if (!Number.isFinite(idx)) return;

    if (action === "edit") {
      extraccion.lineas[idx]._editing = true;
      renderShell();
      return;
    }

    if (action === "delete") {
      if (!confirm("Eliminar esta linea del albaran?")) return;
      extraccion.lineas.splice(idx, 1);
      renderShell();
      return;
    }

    if (action === "save") {
      const card = app.querySelector(`[data-draft-idx="${idx}"]`) as HTMLElement;
      if (!card) return;
      const data = readLineaFromCard(card);
      if (!data.descripcion || !Number.isFinite(data.cantidad) || data.cantidad <= 0) {
        alert("Descripcion y cantidad son obligatorias");
        return;
      }
      extraccion.lineas[idx] = {
        descripcion: data.descripcion,
        cantidad: data.cantidad,
        unidad: data.unidad,
        precio_unitario: data.precio_unitario,
        total: data.total,
        insumo_id: data.insumo_id,
        insumo_nombre: data.insumo_nombre ?? "",
        _editing: false,
      };
      renderShell();
    }
  });

  app.querySelector("#revision-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void guardarAlbaran(new FormData(e.target as HTMLFormElement));
  });
}

async function handleFile(file: File): Promise<void> {
  if (!isPdfFile(file) && !isImageFile(file)) {
    alert("Formato no soportado. Usa PDF, JPG o PNG.");
    return;
  }

  subiendo = true;
  subiendoMensaje = "Leyendo documento...";
  archivoNombre = file.name;
  renderShell();

  try {
    pdfInfo = isPdfFile(file) ? await processPdfFile(file) : await processImageFile(file);

    let text = pdfInfo.text;
    let metodo: "texto" | "ocr" = "texto";

    if (pdfInfo.esEscaneado && pdfInfo.pages.length > 0) {
      subiendoMensaje = "Reconociendo texto (OCR)...";
      renderShell();
      text = await ocrImages(pdfInfo.pages, (p) => {
        subiendoMensaje = `Reconociendo texto (OCR)... ${Math.round(p * 100)}%`;
        renderShell();
      });
      metodo = "ocr";
      pdfInfo = { ...pdfInfo, text };
    }

    const parsed = parseAlbaranText(text, metodo);

    extraccion = {
      ...parsed,
      lineas: parsed.lineas.map((l) => ({
        ...l,
        insumo_id: null,
        insumo_nombre: "",
        _editing: parsed.lineas.length === 0,
      })),
    };

    if (parsed.lineas.length === 0) {
      extraccion.lineas.push({
        descripcion: "",
        cantidad: 1,
        unidad: "ud",
        precio_unitario: null,
        total: null,
        insumo_id: null,
        insumo_nombre: "",
        _editing: true,
      });
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : "Error al procesar el archivo");
    extraccion = null;
    pdfInfo = null;
  } finally {
    subiendo = false;
    subiendoMensaje = "";
    renderShell();
  }
}

async function guardarAlbaran(form: FormData): Promise<void> {
  if (!extraccion) return;
  const errorEl = app.querySelector("#save-error")!;
  errorEl.classList.add("compras-error--hidden");

  if (extraccion.lineas.some((l) => l._editing)) {
    errorEl.textContent = "Guarda o cancela las lineas en edicion antes de continuar";
    errorEl.classList.remove("compras-error--hidden");
    return;
  }

  if (!extraccion.lineas.length) {
    errorEl.textContent = "El albaran debe tener al menos una linea para el coste de ventas";
    errorEl.classList.remove("compras-error--hidden");
    return;
  }

  const proveedor = String(form.get("proveedor") ?? "").trim();
  const fecha = String(form.get("fecha") ?? "");
  const numero = String(form.get("numero") ?? "").trim() || null;

  const lineas = extraccion.lineas.map((l) => ({
    descripcion_original: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precio_unitario: l.precio_unitario,
    total: l.total,
    insumo_id: l.insumo_id,
    insumo_nombre: l.insumo_id ? null : l.insumo_nombre || null,
  }));

  try {
    await api("/api/compras/albaranes", {
      method: "POST",
      body: JSON.stringify({
        proveedor_nombre: proveedor,
        fecha,
        periodo: mesActual,
        numero,
        notas: extraccion.notas,
        metodo_extraccion: extraccion.metodo,
        lineas,
      }),
    });

    extraccion = null;
    pdfInfo = null;
    archivoNombre = "";
    vista = "albaranes";
    await loadInsumos();
    await switchVista();
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : "No se pudo guardar";
    errorEl.classList.remove("compras-error--hidden");
  }
}

// --- Albaranes ---

function renderAlbaranes(): string {
  if (albaranDetalle) return renderAlbaranDetalle();

  if (!albaranes.length) {
    return `<p class="compras-empty">No hay albaranes en ${formatMes(mesActual)}. Sube albaranes en la pestana Subir.</p>`;
  }

  const totalMes = albaranes.reduce((s, a) => s + a.total_importe, 0);

  const rows = albaranes
    .map(
      (a) => `
      <tr class="albaran-row" data-open="${a.id}">
        <td data-label="Fecha">${formatFecha(a.fecha)}</td>
        <td data-label="Proveedor">${escapeHtml(a.proveedor_nombre)}</td>
        <td data-label="N.">${a.numero ? escapeHtml(a.numero) : "&mdash;"}</td>
        <td data-label="Lineas">${a.lineas_count}</td>
        <td data-label="Total">${formatEuro(a.total_importe)}</td>
        <td data-label="">
          <button type="button" class="btn btn--ghost btn--sm" data-open="${a.id}">Lineas</button>
          <button type="button" class="btn btn--ghost btn--sm linea-card__delete" data-delete="${a.id}">Eliminar</button>
        </td>
      </tr>
    `,
    )
    .join("");

  return `
    <p class="periodo-hint">${albaranes.length} albaran${albaranes.length === 1 ? "" : "es"} en ${formatMes(mesActual)} &middot; Total: <strong>${formatEuro(totalMes)}</strong></p>
    <div class="albaranes-table-wrap">
      <table class="albaranes-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Proveedor</th>
            <th>N.</th>
            <th>Lineas</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderAlbaranDetalle(): string {
  if (!albaranDetalle) return "";

  const { albaran, lineas } = albaranDetalle;
  const total = lineas.reduce((s, l) => s + (l.total ?? 0), 0);
  const lineasHtml = lineas.map((l) => renderLineaCardSaved(l)).join("");

  return `
    <section class="albaran-detalle">
      <button type="button" class="btn btn--ghost btn--sm" data-action="volver-albaranes">&larr; Volver</button>
      <header class="albaran-detalle__head">
        <h2 class="albaran-detalle__title">${escapeHtml(albaran.proveedor_nombre)}</h2>
        <p class="albaran-detalle__meta">
          ${formatFecha(albaran.fecha)}
          ${albaran.numero ? ` &middot; N. ${escapeHtml(albaran.numero)}` : ""}
          &middot; ${lineas.length} linea${lineas.length === 1 ? "" : "s"}
          &middot; <strong>${formatEuro(total)}</strong>
        </p>
      </header>

      <p class="lineas-hint">Edita o elimina lineas que no cuenten para el coste de ventas.</p>

      <div class="lineas-list" id="lineas-saved-list">
        ${lineasHtml || `<p class="compras-empty">Sin lineas en este albaran.</p>`}
      </div>
    </section>
  `;
}

async function openAlbaranDetalle(id: number): Promise<void> {
  const data = await api<{ albaran: AlbaranDetalle; lineas: LineaGuardada[] }>(
    `/api/compras/albaranes?id=${id}`,
  );
  albaranDetalle = data;
  editingSavedLineaId = null;
  renderShell();
}

function bindAlbaranesEvents(): void {
  app.querySelector('[data-action="volver-albaranes"]')?.addEventListener("click", () => {
    albaranDetalle = null;
    editingSavedLineaId = null;
    renderShell();
  });

  app.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = Number((btn as HTMLElement).dataset.open);
      if (Number.isFinite(id)) void openAlbaranDetalle(id);
    });
  });

  app.querySelector("#lineas-saved-list")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-saved-action]");
    if (!btn || !albaranDetalle) return;

    const action = btn.dataset.savedAction;
    const lineaId = Number(btn.dataset.lineaId);
    if (!Number.isFinite(lineaId)) return;

    if (action === "edit") {
      editingSavedLineaId = lineaId;
      renderShell();
      return;
    }

    if (action === "delete") {
      if (!confirm("Eliminar esta linea? Dejara de contar en el coste de ventas.")) return;
      void (async () => {
        await api(`/api/compras/lineas?id=${lineaId}`, { method: "DELETE" });
        albaranDetalle!.lineas = albaranDetalle!.lineas.filter((l) => l.id !== lineaId);
        editingSavedLineaId = null;
        await refreshData();
        renderShell();
      })();
      return;
    }

    if (action === "save") {
      const card = app.querySelector(`[data-linea-id="${lineaId}"]`) as HTMLElement;
      if (!card) return;
      const data = readLineaFromCard(card);
      if (!data.descripcion || !Number.isFinite(data.cantidad) || data.cantidad <= 0) {
        alert("Descripcion y cantidad son obligatorias");
        return;
      }
      void (async () => {
        const res = await api<{ linea: LineaGuardada }>(`/api/compras/lineas?id=${lineaId}`, {
          method: "PUT",
          body: JSON.stringify({
            descripcion_original: data.descripcion,
            cantidad: data.cantidad,
            unidad: data.unidad,
            precio_unitario: data.precio_unitario,
            total: data.total,
            insumo_id: data.insumo_id,
            insumo_nombre: data.insumo_nombre,
          }),
        });
        const idx = albaranDetalle!.lineas.findIndex((l) => l.id === lineaId);
        if (idx >= 0) albaranDetalle!.lineas[idx] = res.linea;
        editingSavedLineaId = null;
        await loadInsumos();
        await refreshData();
        renderShell();
      })();
    }
  });

  app.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = Number((btn as HTMLElement).dataset.delete);
      if (!confirm("Eliminar este albaran y todas sus lineas?")) return;
      await api(`/api/compras/albaranes?id=${id}`, { method: "DELETE" });
      albaranDetalle = null;
      await switchVista();
    });
  });
}

// --- Resumen ---

function renderResumen(): string {
  if (!resumen.length) {
    return `<p class="compras-empty">Sin compras en ${formatMes(mesActual)}. Sube albaranes para calcular el coste de ventas.</p>`;
  }

  const rows = resumen
    .map(
      (r) => `
      <tr>
        <td data-label="Insumo">${escapeHtml(r.insumo_nombre)}</td>
        <td data-label="Cantidad">${r.cantidad_total.toLocaleString("es-ES")} ${escapeHtml(r.unidad)}</td>
        <td data-label="Gasto">${formatEuro(r.gasto_total)}</td>
        <td data-label="Lineas">${r.num_lineas}</td>
      </tr>
    `,
    )
    .join("");

  return `
    <div class="cogs-hero">
      <p class="cogs-hero__label">Coste de compras del periodo</p>
      <p class="cogs-hero__value">${formatEuro(totales.gasto_total)}</p>
      <p class="cogs-hero__sub">${formatMes(mesActual)} &middot; ${totales.num_albaranes} albaranes &middot; ${totales.num_lineas} lineas</p>
    </div>

    <div class="resumen-totales">
      <div class="resumen-total-card">
        <span class="resumen-total-card__label">Insumos distintos</span>
        <span class="resumen-total-card__value">${resumen.length}</span>
      </div>
      <div class="resumen-total-card resumen-total-card--accent">
        <span class="resumen-total-card__label">Coste ventas</span>
        <span class="resumen-total-card__value">${formatEuro(totales.gasto_total)}</span>
      </div>
      <div class="resumen-total-card">
        <span class="resumen-total-card__label">Albaranes</span>
        <span class="resumen-total-card__value">${totales.num_albaranes}</span>
      </div>
    </div>

    <div class="resumen-actions">
      <button type="button" class="btn btn--ghost" data-action="pdf">Descargar PDF</button>
      <button type="button" class="btn btn--ghost" data-action="csv">Exportar CSV</button>
    </div>

    <div class="resumen-table-wrap">
      <table class="resumen-table">
        <thead>
          <tr>
            <th>Insumo</th>
            <th>Cantidad</th>
            <th>Gasto</th>
            <th>Lineas</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function bindResumenEvents(): void {
  app.querySelector('[data-action="pdf"]')?.addEventListener("click", () => {
    updateInformePrint();
    window.print();
  });

  app.querySelector('[data-action="csv"]')?.addEventListener("click", () => {
    const header = "Insumo,Cantidad,Unidad,Gasto,Lineas\n";
    const rows = resumen
      .map(
        (r) =>
          `"${r.insumo_nombre}",${r.cantidad_total},"${r.unidad}",${r.gasto_total},${r.num_lineas}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coste-ventas-${mesActual}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function updateInformePrint(): void {
  const rows = resumen.length
    ? resumen
        .map(
          (r) => `
        <tr>
          <td>${escapeHtml(r.insumo_nombre)}</td>
          <td>${r.cantidad_total.toLocaleString("es-ES")} ${escapeHtml(r.unidad)}</td>
          <td>${formatEuro(r.gasto_total)}</td>
          <td>${r.num_lineas}</td>
        </tr>
      `,
        )
        .join("")
    : `<tr><td colspan="4" class="informe-print__empty">Sin datos</td></tr>`;

  const generado = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  informePrint.innerHTML = `
    <div class="informe-print__page">
      <header class="informe-print__header">
        <img class="informe-print__logo" src="${LOGO_URL}" width="148" height="62" alt="Ocote Madrid" />
        <div class="informe-print__meta">
          <h1>Coste de ventas por insumo</h1>
          <p class="informe-print__periodo"><strong>Periodo contable:</strong> ${formatMes(mesActual)}</p>
          <p class="informe-print__sub">Ocote Madrid &middot; Calle Libertad, 5 &middot; 28004 Madrid</p>
          <p class="informe-print__sub"><strong>Coste de compras:</strong> ${formatEuro(totales.gasto_total)} &middot; <strong>Albaranes:</strong> ${totales.num_albaranes}</p>
        </div>
      </header>
      <table class="informe-print__table">
        <thead>
          <tr>
            <th>Insumo</th>
            <th>Cantidad</th>
            <th>Gasto</th>
            <th>Lineas</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <footer class="informe-print__footer">
        <p class="informe-print__gen">Documento generado el ${generado}</p>
      </footer>
    </div>
  `;
}

void loadApp();
