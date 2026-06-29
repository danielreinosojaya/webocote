import "./temperatura.css";

type EquipoTipo = "refrigeracion" | "congelacion" | "vegetales";
type TempEstado = "ok" | "warning" | "danger";
type Momento = "inicio" | "fin";
type Vista = "hoy" | "mes";
type FiltroModo = "mes" | "rango";

interface Equipo {
  id: number;
  nombre: string;
  tipo: EquipoTipo;
  temp_max: number;
}

interface Lectura {
  id: number;
  hora: string;
  temperatura: number;
  responsable: string;
  incidencias: string | null;
  estado: TempEstado;
}

interface DashboardItem {
  equipo: Equipo;
  inicio: Lectura | null;
  fin: Lectura | null;
  pendiente_inicio: boolean;
  pendiente_fin: boolean;
  completo: boolean;
  pendiente: boolean;
}

interface RegistroMes {
  id: number;
  equipo_id: number;
  fecha: string;
  momento: Momento;
  hora: string;
  temperatura: number;
  responsable: string;
  incidencias: string | null;
  equipo_nombre: string;
  equipo_tipo: EquipoTipo;
  temp_max: number;
  estado: TempEstado;
}

const app = document.getElementById("app")!;
const informePrint = document.getElementById("informe-print")!;
const STORAGE_RESP = "ocote_temp_responsable";
const LOGO_URL = "/web/media/logo-dark.png";

let vista: Vista = "hoy";
let fechaHoy = isoDate(new Date());
let mesActual = fechaHoy.slice(0, 7);
let filtroModo: FiltroModo = "mes";
let periodoDesde = monthBounds(mesActual).desde;
let periodoHasta = monthBounds(mesActual).hasta;
let equipoFiltroId: number | null = null;
let equipos: Equipo[] = [];
let dashboard: DashboardItem[] = [];
let registrosMes: RegistroMes[] = [];
let equipoModal: Equipo | null = null;
let equipoModalMomento: Momento = "inicio";
let diaBloqueado = false;
let mensajeBloqueo: string | null = null;
let diaCompleto = false;
let puedeSiguienteDia = false;
let hoyCalendario = isoDate(new Date());
let pinBuffer = "";

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

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

function formatMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

function formatPeriodoCorto(desde: string, hasta: string): string {
  const a = new Date(desde + "T12:00:00");
  const b = new Date(hasta + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${a.toLocaleDateString("es-ES", opts)} ù ${b.toLocaleDateString("es-ES", opts)}`;
}

function formatFechaTabla(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

function momentoLabel(momento: Momento): string {
  return momento === "inicio" ? "Apertura" : "Cierre";
}

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return isoDate(dt);
}

function tipoLabel(tipo: EquipoTipo): string {
  if (tipo === "congelacion") return "Congelacion - max -18\u00B0C";
  if (tipo === "vegetales") return "Vegetales - max 8\u00B0C";
  return "Refrigeracion - max 4\u00B0C";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildRegistrosUrl(): string {
  const params = new URLSearchParams();
  if (filtroModo === "mes") {
    params.set("mes", mesActual);
  } else {
    params.set("desde", periodoDesde);
    params.set("hasta", periodoHasta);
  }
  if (equipoFiltroId) params.set("equipo_id", String(equipoFiltroId));
  return `/api/temperatura/registros?${params}`;
}

function renderLogin(error = ""): void {
  const dots = Array.from({ length: 6 }, (_, i) => {
    const filled = i < pinBuffer.length;
    return `<span class="pin-dot${filled ? " pin-dot--filled" : ""}" aria-hidden="true"></span>`;
  }).join("");

  app.innerHTML = `
    <div class="temp-login">
      <header class="temp-login__brand">
        <img src="/web/svg/fuego.svg" alt="" width="32" height="32" />
        <div>
          <p class="temp-login__eyebrow">Ocote Madrid</p>
          <h1 class="temp-login__title">Control sanitario</h1>
        </div>
      </header>
      <p class="temp-login__hint">Introduce el codigo de acceso</p>
      <div class="pin-display" aria-label="Codigo introducido">${dots}</div>
      ${error ? `<p class="temp-error" role="alert">${escapeHtml(error)}</p>` : ""}
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
    await api("/api/temperatura/login", {
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

async function loadEquipos(): Promise<void> {
  if (equipos.length) return;
  const data = await api<{ equipos: Equipo[] }>("/api/temperatura/equipos");
  equipos = data.equipos;
}

async function loadApp(): Promise<void> {
  const { authenticated } = await api<{ authenticated: boolean }>("/api/temperatura/session");
  if (!authenticated) {
    renderLogin();
    return;
  }
  await loadEquipos();
  await refreshData();
  renderShell();
}

async function refreshData(): Promise<void> {
  if (vista === "hoy") {
    const data = await api<{
      fecha: string;
      hoy: string;
      bloqueado: boolean;
      mensaje_bloqueo: string | null;
      dia_completo: boolean;
      puede_siguiente_dia: boolean;
      items: DashboardItem[];
    }>(`/api/temperatura/dashboard?fecha=${fechaHoy}`);
    fechaHoy = data.fecha;
    hoyCalendario = data.hoy;
    diaBloqueado = data.bloqueado;
    mensajeBloqueo = data.mensaje_bloqueo;
    diaCompleto = data.dia_completo;
    puedeSiguienteDia = data.puede_siguiente_dia;
    dashboard = data.items;
  } else {
    const data = await api<{ desde: string; hasta: string; registros: RegistroMes[] }>(
      buildRegistrosUrl(),
    );
    periodoDesde = data.desde;
    periodoHasta = data.hasta;
    registrosMes = data.registros;
    updateInformePrint();
  }
}

function periodoTitulo(): string {
  if (filtroModo === "mes") return formatMes(mesActual);
  return formatPeriodoCorto(periodoDesde, periodoHasta);
}

function renderShell(): void {
  app.innerHTML = `
    <header class="temp-header">
      <div class="temp-header__brand">
        <img src="/web/svg/fuego.svg" alt="" width="24" height="24" />
        <div>
          <p class="temp-header__eyebrow">Control sanitario</p>
          <h1 class="temp-header__title">${vista === "hoy" ? formatFecha(fechaHoy) : periodoTitulo()}</h1>
        </div>
      </div>
      <div class="temp-header__actions">
        <button type="button" class="btn btn--ghost btn--sm" data-action="logout">Salir</button>
      </div>
    </header>

    <nav class="temp-tabs" aria-label="Vistas">
      <button type="button" class="temp-tabs__btn${vista === "hoy" ? " is-active" : ""}" data-vista="hoy">Hoy</button>
      <button type="button" class="temp-tabs__btn${vista === "mes" ? " is-active" : ""}" data-vista="mes">Informes</button>
    </nav>

    ${vista === "hoy" ? renderDiaNav() : ""}

    <main class="temp-main">
      ${vista === "hoy" ? renderHoy() : renderMes()}
    </main>

    <div id="modal-root"></div>
  `;

  app.querySelector('[data-action="logout"]')?.addEventListener("click", () => void logout());
  app.querySelectorAll<HTMLButtonElement>("[data-vista]").forEach((btn) => {
    btn.addEventListener("click", () => {
      vista = btn.dataset.vista as Vista;
      void switchVista();
    });
  });

  if (vista === "hoy") {
    bindHoyEvents();
  } else {
    bindMesEvents();
  }
}

async function switchVista(): Promise<void> {
  await refreshData();
  renderShell();
}

function renderDiaNav(): string {
  const estado = diaCompleto
    ? '<span class="dia-nav__ok">Dia completo</span>'
    : '<span class="dia-nav__pendiente">Lecturas pendientes</span>';

  return `
    <nav class="dia-nav" aria-label="Navegacion por dia">
      <button type="button" class="btn btn--ghost btn--sm" data-dia="prev" aria-label="Dia anterior">&larr;</button>
      ${estado}
      <button type="button" class="btn btn--ghost btn--sm" data-dia="next"
        ${puedeSiguienteDia ? "" : "disabled"}
        aria-label="Dia siguiente">&rarr;</button>
    </nav>
  `;
}

function renderLecturaSlot(
  equipoId: number,
  momento: Momento,
  lectura: Lectura | null,
): string {
  const label = momentoLabel(momento);
  if (lectura) {
    return `
      <div class="lectura-slot lectura-slot--${lectura.estado}">
        <div class="lectura-slot__head">
          <span class="lectura-slot__label">${label}</span>
          <span class="lectura-slot__temp">${lectura.temperatura}\u00B0C</span>
        </div>
        <p class="lectura-slot__meta">${lectura.hora} &middot; ${escapeHtml(lectura.responsable)}</p>
        ${lectura.incidencias ? `<p class="lectura-slot__inc">${escapeHtml(lectura.incidencias)}</p>` : ""}
        <button type="button" class="btn btn--ghost btn--sm btn--block" data-registrar="${equipoId}" data-momento="${momento}">
          Actualizar ${label.toLowerCase()}
        </button>
      </div>
    `;
  }

  return `
    <div class="lectura-slot lectura-slot--empty">
      <span class="lectura-slot__label">${label}</span>
      <p class="lectura-slot__pending">Sin registro</p>
      <button type="button" class="btn btn--primary btn--sm btn--block" data-registrar="${equipoId}" data-momento="${momento}">
        Registrar ${label.toLowerCase()}
      </button>
    </div>
  `;
}

function renderHoy(): string {
  const pendientes = dashboard.filter((i) => !i.completo).length;
  const bloqueo = diaBloqueado && mensajeBloqueo
    ? `<p class="temp-alert temp-alert--bloqueo" role="alert">${escapeHtml(mensajeBloqueo)}</p>`
    : "";

  const cards = dashboard
    .map((item) => {
      const { equipo, completo } = item;
      return `
        <article class="equipo-card${completo ? "" : " equipo-card--pendiente"}" data-equipo-id="${equipo.id}">
          <div class="equipo-card__head">
            <h2 class="equipo-card__name">${escapeHtml(equipo.nombre)}</h2>
            <span class="equipo-card__tipo">${tipoLabel(equipo.tipo)}</span>
          </div>
          <div class="equipo-card__lecturas">
            ${renderLecturaSlot(equipo.id, "inicio", item.inicio)}
            ${renderLecturaSlot(equipo.id, "fin", item.fin)}
          </div>
        </article>
      `;
    })
    .join("");

  return `
    ${bloqueo}
    ${pendientes > 0 ? `<p class="temp-alert">${pendientes} equipo${pendientes > 1 ? "s" : ""} con lecturas incompletas (apertura y cierre)</p>` : ""}
    <div class="equipo-grid">${cards}</div>
    <p class="temp-legal">Dos lecturas diarias por equipo: apertura y cierre. Normativa Comunidad de Madrid.</p>
  `;
}

function renderFiltroPanel(): string {
  const equipoOptions = equipos
    .map(
      (e) =>
        `<option value="${e.id}"${equipoFiltroId === e.id ? " selected" : ""}>${escapeHtml(e.nombre)}</option>`,
    )
    .join("");

  const mesFields =
    filtroModo === "mes"
      ? `
        <label class="filtro-field">
          <span>Mes</span>
          <input type="month" name="mes" value="${mesActual}" class="filtro-input" />
        </label>
      `
      : `
        <label class="filtro-field">
          <span>Desde</span>
          <input type="date" name="desde" value="${periodoDesde}" class="filtro-input" />
        </label>
        <label class="filtro-field">
          <span>Hasta</span>
          <input type="date" name="hasta" value="${periodoHasta}" class="filtro-input" />
        </label>
      `;

  return `
    <section class="filtro-panel" aria-label="Filtro de periodo">
      <div class="filtro-panel__presets">
        <button type="button" class="filtro-preset${filtroModo === "mes" && mesActual === fechaHoy.slice(0, 7) ? " is-active" : ""}" data-preset="mes-actual">Este mes</button>
        <button type="button" class="filtro-preset" data-preset="mes-anterior">Mes anterior</button>
        <button type="button" class="filtro-preset" data-preset="ultimos-7">Ultimos 7 dias</button>
        <button type="button" class="filtro-preset${filtroModo === "rango" ? " is-active" : ""}" data-preset="personalizado">Personalizado</button>
      </div>

      <form class="filtro-panel__form" id="filtro-form">
        <div class="filtro-panel__fields">
          ${mesFields}
          <label class="filtro-field">
            <span>Equipo</span>
            <select name="equipo" class="filtro-input">
              <option value="">Todos los equipos</option>
              ${equipoOptions}
            </select>
          </label>
        </div>
        <div class="filtro-panel__actions">
          <button type="submit" class="btn btn--primary">Aplicar filtro</button>
          <button type="button" class="btn btn--ghost" data-action="pdf">Descargar PDF</button>
        </div>
      </form>
      <p class="filtro-panel__resumen">${registrosMes.length} registro${registrosMes.length === 1 ? "" : "s"} &middot; ${formatPeriodoCorto(periodoDesde, periodoHasta)}</p>
    </section>
  `;
}

function renderMesTable(): string {
  if (!registrosMes.length) {
    return `<p class="temp-empty">No hay registros en el periodo seleccionado.</p>`;
  }

  const rows = registrosMes
    .map((r) => {
      const day = Number(r.fecha.split("-")[2]);
      return `
        <tr class="mes-row mes-row--${r.estado}">
          <td data-label="Equipo">${escapeHtml(r.equipo_nombre)}</td>
          <td data-label="Fecha">${formatFechaTabla(r.fecha)}</td>
          <td data-label="Lectura">${momentoLabel(r.momento)}</td>
          <td data-label="Dia">${day}</td>
          <td data-label="Temp.">${r.temperatura}\u00B0C</td>
          <td data-label="Hora">${r.hora}</td>
          <td data-label="Responsable">${escapeHtml(r.responsable)}</td>
          <td data-label="Incidencias">${r.incidencias ? escapeHtml(r.incidencias) : "&mdash;"}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="mes-table-wrap">
      <table class="mes-table">
        <thead>
          <tr>
            <th>Equipo / Camara</th>
            <th>Fecha</th>
            <th>Lectura</th>
            <th>Dia</th>
            <th>Temp. (&deg;C)</th>
            <th>Hora</th>
            <th>Responsable</th>
            <th>Incidencias / Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderMes(): string {
  return `${renderFiltroPanel()}${renderMesTable()}`;
}

function bindHoyEvents(): void {
  app.querySelector('[data-dia="prev"]')?.addEventListener("click", () => {
    fechaHoy = shiftDay(fechaHoy, -1);
    void switchVista();
  });

  app.querySelector<HTMLButtonElement>('[data-dia="next"]')?.addEventListener("click", (btn) => {
    if (btn.currentTarget.disabled) return;
    fechaHoy = shiftDay(fechaHoy, 1);
    void switchVista();
  });

  app.querySelectorAll<HTMLButtonElement>("[data-registrar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.registrar);
      const momento = btn.dataset.momento as Momento;
      const item = dashboard.find((d) => d.equipo.id === id);
      if (!item) return;
      const lectura = momento === "inicio" ? item.inicio : item.fin;
      openModal(item.equipo, momento, lectura);
    });
  });
}

function applyPreset(preset: string): void {
  const hoy = isoDate(new Date());
  const mesHoy = hoy.slice(0, 7);

  if (preset === "mes-actual") {
    filtroModo = "mes";
    mesActual = mesHoy;
    const b = monthBounds(mesActual);
    periodoDesde = b.desde;
    periodoHasta = b.hasta;
  } else if (preset === "mes-anterior") {
    filtroModo = "mes";
    mesActual = shiftMonth(mesHoy, -1);
    const b = monthBounds(mesActual);
    periodoDesde = b.desde;
    periodoHasta = b.hasta;
  } else if (preset === "ultimos-7") {
    filtroModo = "rango";
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    periodoDesde = isoDate(start);
    periodoHasta = isoDate(end);
  } else if (preset === "personalizado") {
    filtroModo = "rango";
  }
}

function bindMesEvents(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset!;
      applyPreset(preset);
      if (preset === "personalizado") {
        renderShell();
      } else {
        void switchVista();
      }
    });
  });

  app.querySelector("#filtro-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);

    if (filtroModo === "mes") {
      const mes = String(form.get("mes") ?? "");
      if (mes) {
        mesActual = mes;
        const b = monthBounds(mesActual);
        periodoDesde = b.desde;
        periodoHasta = b.hasta;
      }
    } else {
      const desde = String(form.get("desde") ?? "");
      const hasta = String(form.get("hasta") ?? "");
      if (desde) periodoDesde = desde;
      if (hasta) periodoHasta = hasta;
    }

    const eq = String(form.get("equipo") ?? "");
    equipoFiltroId = eq ? Number(eq) : null;

    void switchVista();
  });

  app.querySelector('[data-action="pdf"]')?.addEventListener("click", () => {
    updateInformePrint();
    window.print();
  });
}

function updateInformePrint(): void {
  const equipoLabel = equipoFiltroId
    ? equipos.find((e) => e.id === equipoFiltroId)?.nombre ?? "Equipo filtrado"
    : "Todos los equipos";

  const rows = registrosMes.length
    ? registrosMes
        .map(
          (r) => `
        <tr>
          <td>${escapeHtml(r.equipo_nombre)}</td>
          <td>${formatFechaTabla(r.fecha)}</td>
          <td>${momentoLabel(r.momento)}</td>
          <td>${r.temperatura}\u00B0C</td>
          <td>${r.hora}</td>
          <td>${escapeHtml(r.responsable)}</td>
          <td>${r.incidencias ? escapeHtml(r.incidencias) : "&mdash;"}</td>
        </tr>
      `,
        )
        .join("")
    : `<tr><td colspan="7" class="informe-print__empty">Sin registros en el periodo seleccionado</td></tr>`;

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
          <h1>Registro de control de temperaturas</h1>
          <p class="informe-print__periodo"><strong>Periodo:</strong> ${formatPeriodoCorto(periodoDesde, periodoHasta)}</p>
          <p class="informe-print__sub">Ocote Madrid &middot; Calle Libertad, 5 &middot; 28004 Madrid</p>
          <p class="informe-print__sub"><strong>Equipo:</strong> ${escapeHtml(equipoLabel)}</p>
        </div>
      </header>

      <table class="informe-print__table">
        <thead>
          <tr>
            <th>Equipo / Camara</th>
            <th>Fecha</th>
            <th>Lectura</th>
            <th>Temp. (&deg;C)</th>
            <th>Hora</th>
            <th>Responsable</th>
            <th>Incidencias / Acciones correctoras</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <footer class="informe-print__footer">
        <p>Refrigeracion: max. 4 &deg;C &middot; Vegetales frescos: max. 8 &deg;C &middot; Congelacion: max. -18 &deg;C</p>
        <p>Registros conservados en el establecimiento durante al menos un ano (Normativa Comunidad de Madrid).</p>
        <p class="informe-print__gen">Documento generado el ${generado}</p>
      </footer>
    </div>
  `;
}

function openModal(equipo: Equipo, momento: Momento, registro: Lectura | null): void {
  equipoModal = equipo;
  equipoModalMomento = momento;
  const root = document.getElementById("modal-root")!;
  const lastResp = localStorage.getItem(STORAGE_RESP) ?? registro?.responsable ?? "";

  root.innerHTML = `
    <div class="modal-backdrop" data-close="1">
      <div class="modal" role="dialog" aria-labelledby="modal-title" aria-modal="true">
        <header class="modal__head">
          <div>
            <p class="modal__momento">${momentoLabel(momento)}</p>
            <h2 id="modal-title">${escapeHtml(equipo.nombre)}</h2>
          </div>
          <button type="button" class="modal__close" data-close="1" aria-label="Cerrar">&times;</button>
        </header>
        <form class="modal__form" id="registro-form">
          <input type="hidden" name="momento" value="${momento}" />
          <label class="field">
            <span>Temperatura (&deg;C)</span>
            <input name="temperatura" type="number" step="0.1" inputmode="decimal" required
              value="${registro?.temperatura ?? ""}" placeholder="ej. 3.5" />
          </label>
          <label class="field">
            <span>Hora</span>
            <input name="hora" type="time" required value="${registro?.hora ?? nowTime()}" />
          </label>
          <label class="field">
            <span>Responsable (iniciales)</span>
            <input name="responsable" type="text" maxlength="20" required
              value="${escapeHtml(lastResp)}" placeholder="ej. J.P." autocapitalize="characters" />
          </label>
          <label class="field">
            <span>Incidencias / acciones correctoras</span>
            <textarea name="incidencias" rows="3" placeholder="Obligatorio si la temperatura esta fuera de rango">${registro?.incidencias ? escapeHtml(registro.incidencias) : ""}</textarea>
          </label>
          <p class="modal__hint">${tipoLabel(equipo.tipo)}</p>
          <p class="temp-error temp-error--hidden" id="form-error" role="alert"></p>
          <button type="submit" class="btn btn--primary btn--block">Guardar registro</button>
        </form>
      </div>
    </div>
  `;

  root.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target === el) closeModal();
    });
  });

  root.querySelector("#registro-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void submitRegistro(new FormData(e.target as HTMLFormElement));
  });
}

function closeModal(): void {
  document.getElementById("modal-root")!.innerHTML = "";
  equipoModal = null;
  equipoModalMomento = "inicio";
}

async function submitRegistro(form: FormData): Promise<void> {
  if (!equipoModal) return;

  const errorEl = document.getElementById("form-error")!;
  errorEl.classList.add("temp-error--hidden");

  const temperatura = Number(form.get("temperatura"));
  const hora = String(form.get("hora") ?? "").slice(0, 5);
  const responsable = String(form.get("responsable") ?? "").trim().toUpperCase();
  const incidencias = String(form.get("incidencias") ?? "").trim();
  const momento = String(form.get("momento") ?? equipoModalMomento) as Momento;

  try {
    await api("/api/temperatura/registros", {
      method: "POST",
      body: JSON.stringify({
        equipo_id: equipoModal.id,
        fecha: fechaHoy,
        momento,
        hora,
        temperatura,
        responsable,
        incidencias: incidencias || null,
      }),
    });
    localStorage.setItem(STORAGE_RESP, responsable);
    closeModal();
    await refreshData();
    renderShell();
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : "No se pudo guardar";
    errorEl.classList.remove("temp-error--hidden");
  }
}

async function logout(): Promise<void> {
  await api("/api/temperatura/login", { method: "DELETE" });
  renderLogin();
}

void loadApp();
