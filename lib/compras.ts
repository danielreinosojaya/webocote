export type AlbaranEstado = "borrador" | "confirmado";

export interface LineaExtraida {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  total: number | null;
}

export interface AlbaranExtraido {
  proveedor: string;
  fecha: string | null;
  numero: string | null;
  lineas: LineaExtraida[];
  confianza: "alta" | "media" | "baja";
  metodo: "texto" | "ocr";
  notas: string | null;
}

export interface Insumo {
  id: number;
  nombre: string;
  unidad: string;
  categoria: string | null;
}

export interface LineaCompra {
  id: number;
  albaran_id: number;
  insumo_id: number | null;
  descripcion_original: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  total: number | null;
  insumo_nombre: string | null;
}

export interface Albaran {
  id: number;
  proveedor_nombre: string;
  proveedor_id: number | null;
  fecha: string;
  numero: string | null;
  estado: AlbaranEstado;
  notas: string | null;
  lineas_count: number;
  total_importe: number;
}

export interface ResumenInsumo {
  insumo_id: number | null;
  insumo_nombre: string;
  unidad: string;
  cantidad_total: number;
  gasto_total: number;
  num_lineas: number;
}

export function parseMonth(value: string | undefined): { year: number; month: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  if (!y || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

export function monthBounds(mes: { year: number; month: number }): { desde: string; hasta: string } {
  const start = `${mes.year}-${String(mes.month).padStart(2, "0")}-01`;
  const endDate = new Date(mes.year, mes.month, 0);
  const hasta = endDate.toISOString().slice(0, 10);
  return { desde: start, hasta };
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return value;
}
