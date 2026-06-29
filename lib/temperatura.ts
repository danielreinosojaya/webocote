export type EquipoTipo = "refrigeracion" | "congelacion" | "vegetales";

export interface Equipo {
  id: number;
  nombre: string;
  tipo: EquipoTipo;
  temp_max: number;
  activo: boolean;
  orden: number;
}

export interface Registro {
  id: number;
  equipo_id: number;
  fecha: string;
  hora: string;
  temperatura: number;
  responsable: string;
  incidencias: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistroConEquipo extends Registro {
  equipo_nombre: string;
  equipo_tipo: EquipoTipo;
  temp_max: number;
}

export function tempMaxForTipo(tipo: EquipoTipo): number {
  switch (tipo) {
    case "congelacion":
      return -18;
    case "vegetales":
      return 8;
    default:
      return 4;
  }
}

export type TempEstado = "ok" | "warning" | "danger";

export function evaluarTemperatura(
  temperatura: number,
  tipo: EquipoTipo,
  tempMax?: number,
): TempEstado {
  const max = tempMax ?? tempMaxForTipo(tipo);

  if (tipo === "congelacion") {
    if (temperatura <= max) return "ok";
    if (temperatura <= max + 2) return "warning";
    return "danger";
  }

  if (temperatura <= max) return "ok";
  if (tipo === "vegetales" && temperatura <= 10) return "warning";
  if (temperatura <= max + 2) return "warning";
  return "danger";
}

export function tipoLabel(tipo: EquipoTipo): string {
  switch (tipo) {
    case "congelacion":
      return "Congelación";
    case "vegetales":
      return "Vegetales frescos";
    default:
      return "Refrigeración";
  }
}
