export interface LineaParseada {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  total: number | null;
}

export interface AlbaranParseado {
  proveedor: string;
  fecha: string | null;
  numero: string | null;
  lineas: LineaParseada[];
  confianza: "alta" | "media" | "baja";
  metodo: "texto" | "ocr";
  notas: string | null;
}

const SKIP_LINE =
  /^(total|subtotal|base|iva|importe|factura|albaran|nif|cif|dni|tel|tlf|phone|iban|cargo|descuento|portes|observ|notas|pagina|fecha|vencimiento|forma de pago|datos fiscales|cliente|proveedor|envio|entrega|unidades|descripcion|articulo|producto|cantidad|precio|importe|ud\.|uds\.)/i;

const UNIDADES = /\b(kg|kgs|kilos?|g|gr|l|lt|litros?|ud|uds|unid|unidades?|caja|cajas|pack|bolsa|saco|bandeja|racimo|docena)\b/i;

function parseSpanishNumber(raw: string): number | null {
  const t = raw.trim().replace(/[€$]/g, "");
  if (!t || !/^[\d.,]+$/.test(t)) return null;
  if (t.includes(",") && t.includes(".")) {
    return Number(t.replace(/\./g, "").replace(",", "."));
  }
  if (t.includes(",")) {
    return Number(t.replace(",", "."));
  }
  return Number(t);
}

function parseFecha(text: string): string | null {
  const patterns = [
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let y: number, mo: number, d: number;
    if (m[1].length === 4) {
      y = Number(m[1]);
      mo = Number(m[2]);
      d = Number(m[3]);
    } else {
      d = Number(m[1]);
      mo = Number(m[2]);
      y = Number(m[3]);
    }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

function parseNumero(text: string): string | null {
  const m = text.match(/albar[aá]n\s*(?:n[ºo°.]?\s*)?([A-Z0-9\-\/]+)/i);
  if (m) return m[1];
  const m2 = text.match(/(?:n[ºo°.]\s*(?:albar[aá]n|alb|doc))\s*([A-Z0-9\-\/]+)/i);
  return m2 ? m2[1] : null;
}

function parseProveedor(lines: string[]): string {
  for (const line of lines.slice(0, 12)) {
    const t = line.trim();
    if (t.length < 3 || t.length > 120) continue;
    if (SKIP_LINE.test(t)) continue;
    if (/^\d+[.,]?\d*$/.test(t)) continue;
    if (/^(c\/|av\.|avda|calle|pol\.)/i.test(t)) continue;
    if (/\d{5}\s+[a-záéíóú]/i.test(t)) continue;
    if (/^(nif|cif|tel|tlf)/i.test(t)) continue;
    return t;
  }
  return "Proveedor desconocido";
}

function extractUnidad(text: string): string {
  const m = text.match(UNIDADES);
  if (!m) return "ud";
  const u = m[1].toLowerCase();
  if (u.startsWith("kil") || u === "kg" || u === "kgs") return "kg";
  if (u === "g" || u === "gr") return "g";
  if (u.startsWith("lit") || u === "l" || u === "lt") return "l";
  if (u.startsWith("caj")) return "caja";
  if (u.startsWith("unid") || u === "ud" || u === "uds") return "ud";
  return u;
}

function parseLinea(line: string): LineaParseada | null {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (trimmed.length < 4 || SKIP_LINE.test(trimmed)) return null;
  if (/^\d+[.,]?\d*$/.test(trimmed)) return null;

  const numbers = [...trimmed.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2,3}|\d+)/g)].map((m) =>
    m[1].trim(),
  );
  if (numbers.length < 1) return null;

  let cantidad: number;
  let precio_unitario: number | null = null;
  let total: number | null = null;
  let descEnd = trimmed.length;

  if (numbers.length >= 3) {
    total = parseSpanishNumber(numbers[numbers.length - 1]);
    precio_unitario = parseSpanishNumber(numbers[numbers.length - 2]);
    cantidad = parseSpanishNumber(numbers[numbers.length - 3]) ?? 0;
    const lastNumIdx = trimmed.lastIndexOf(numbers[numbers.length - 3]);
    descEnd = lastNumIdx > 0 ? lastNumIdx : trimmed.length;
  } else if (numbers.length === 2) {
    cantidad = parseSpanishNumber(numbers[0]) ?? 0;
    total = parseSpanishNumber(numbers[1]);
    const idx = trimmed.indexOf(numbers[0]);
    descEnd = idx > 0 ? idx : trimmed.length;
  } else {
    cantidad = parseSpanishNumber(numbers[0]) ?? 0;
    const idx = trimmed.indexOf(numbers[0]);
    descEnd = idx > 0 ? idx : trimmed.length;
  }

  if (!cantidad || cantidad <= 0) return null;

  const descripcion = trimmed.slice(0, descEnd).replace(/[\s\-–]+$/, "").trim();
  if (descripcion.length < 2) return null;
  if (/^(total|subtotal|iva|base)/i.test(descripcion)) return null;

  return {
    descripcion,
    cantidad,
    unidad: extractUnidad(descripcion),
    precio_unitario,
    total,
  };
}

export function parseAlbaranText(text: string, metodo: "texto" | "ocr"): AlbaranParseado {
  const normalized = text.replace(/\r/g, "").trim();
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const fecha = parseFecha(normalized);
  const numero = parseNumero(normalized);
  const proveedor = parseProveedor(lines);

  const lineas: LineaParseada[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parsed = parseLinea(line);
    if (!parsed) continue;
    const key = `${parsed.descripcion}|${parsed.cantidad}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lineas.push(parsed);
  }

  let confianza: "alta" | "media" | "baja" = "baja";
  if (lineas.length >= 3 && fecha) confianza = "alta";
  else if (lineas.length >= 1) confianza = "media";

  const notas =
    lineas.length === 0
      ? "No se detectaron lineas automaticamente. Anadelas manualmente o revisa el texto extraido."
      : confianza === "baja"
        ? "Pocas lineas detectadas. Revisa y corrige antes de guardar."
        : null;

  return {
    proveedor,
    fecha,
    numero,
    lineas,
    confianza,
    metodo,
    notas,
  };
}
