import { neon } from "@neondatabase/serverless";

export type Momento = "inicio" | "fin";
type Sql = ReturnType<typeof neon>;

export function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export function momentoLabel(momento: Momento): string {
  return momento === "inicio" ? "Apertura" : "Cierre";
}

export function isMomento(value: string): value is Momento {
  return value === "inicio" || value === "fin";
}

export async function findPrimerDiaIncompleto(sql: Sql, hasta: string): Promise<string | null> {
  const rows = await sql`
    WITH inicio AS (
      SELECT COALESCE(MIN(fecha), ${hasta}::date) AS desde FROM registros
    ),
    fechas AS (
      SELECT generate_series(
        (SELECT desde FROM inicio),
        ${hasta}::date,
        INTERVAL '1 day'
      )::date AS fecha
    ),
    incompletos AS (
      SELECT f.fecha
      FROM fechas f
      CROSS JOIN equipos e
      WHERE e.activo = TRUE
        AND (
          NOT EXISTS (
            SELECT 1 FROM registros r
            WHERE r.fecha = f.fecha AND r.equipo_id = e.id AND r.momento = 'inicio'
          )
          OR NOT EXISTS (
            SELECT 1 FROM registros r
            WHERE r.fecha = f.fecha AND r.equipo_id = e.id AND r.momento = 'fin'
          )
        )
      GROUP BY f.fecha
    )
    SELECT MIN(fecha)::text AS fecha FROM incompletos
  `;
  return rows[0]?.fecha ?? null;
}

export async function isDiaCompleto(sql: Sql, fecha: string): Promise<boolean> {
  const rows = await sql`
    SELECT COUNT(*)::int AS pendientes
    FROM equipos e
    WHERE e.activo = TRUE
      AND (
        NOT EXISTS (
          SELECT 1 FROM registros r
          WHERE r.fecha = ${fecha}::date AND r.equipo_id = e.id AND r.momento = 'inicio'
        )
        OR NOT EXISTS (
          SELECT 1 FROM registros r
          WHERE r.fecha = ${fecha}::date AND r.equipo_id = e.id AND r.momento = 'fin'
        )
      )
  `;
  return (rows[0]?.pendientes ?? 0) === 0;
}
