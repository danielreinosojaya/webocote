import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth.js";
import { getSql } from "../../lib/db.js";
import { evaluarTemperatura, tempMaxForTipo, type EquipoTipo } from "../../lib/temperatura.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  if (!requireAuth(req, res)) return;

  const fecha =
    typeof req.query.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)
      ? req.query.fecha
      : todayIso();

  const sql = getSql();

  const equipos = await sql`
    SELECT id, nombre, tipo, temp_max::float AS temp_max, activo, orden
    FROM equipos
    WHERE activo = TRUE
    ORDER BY orden ASC, nombre ASC
  `;

  const registros = await sql`
    SELECT
      r.id,
      r.equipo_id,
      r.fecha::text AS fecha,
      to_char(r.hora, 'HH24:MI') AS hora,
      r.temperatura::float AS temperatura,
      r.responsable,
      r.incidencias
    FROM registros r
    WHERE r.fecha = ${fecha}::date
  `;

  const byEquipo = new Map<number, (typeof registros)[number]>();
  for (const row of registros) {
    byEquipo.set(row.equipo_id, row);
  }

  const items = equipos.map((equipo) => {
    const registro = byEquipo.get(equipo.id);
    const tipo = equipo.tipo as EquipoTipo;
    const tempMax = Number(equipo.temp_max);
    const estado = registro
      ? evaluarTemperatura(Number(registro.temperatura), tipo, tempMax)
      : "danger";

    return {
      equipo: {
        id: equipo.id,
        nombre: equipo.nombre,
        tipo,
        temp_max: tempMax,
        orden: equipo.orden,
      },
      registro: registro
        ? {
            id: registro.id,
            hora: registro.hora,
            temperatura: Number(registro.temperatura),
            responsable: registro.responsable,
            incidencias: registro.incidencias,
            estado,
          }
        : null,
      pendiente: !registro,
    };
  });

  res.status(200).json({ fecha, items });
}
