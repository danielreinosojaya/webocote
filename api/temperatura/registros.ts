import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth.js";
import { getSql } from "../../lib/db.js";
import { findPrimerDiaIncompleto, isMomento, todayMadrid } from "../../lib/dia-operativo.js";
import { ensureSchema } from "../../lib/ensure-schema.js";
import { evaluarTemperatura, type EquipoTipo } from "../../lib/temperatura.js";

function parseMonth(value: string | undefined): { year: number; month: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  if (!y || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function parseDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return value;
}

function monthBounds(mes: { year: number; month: number }): { desde: string; hasta: string } {
  const start = `${mes.year}-${String(mes.month).padStart(2, "0")}-01`;
  const endDate = new Date(mes.year, mes.month, 0);
  const hasta = endDate.toISOString().slice(0, 10);
  return { desde: start, hasta };
}

function resolvePeriod(query: VercelRequest["query"]): { desde: string; hasta: string } | null {
  const desde = parseDate(typeof query.desde === "string" ? query.desde : undefined);
  const hasta = parseDate(typeof query.hasta === "string" ? query.hasta : undefined);

  if (desde && hasta) {
    if (desde > hasta) return null;
    return { desde, hasta };
  }

  const mes = parseMonth(typeof query.mes === "string" ? query.mes : undefined);
  if (mes) return monthBounds(mes);

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
  } catch (err) {
    console.error("schema error:", err);
    res.status(500).json({ error: "Error de base de datos" });
    return;
  }

  const sql = getSql();

  if (req.method === "GET") {
    if (!requireAuth(req, res)) return;

    const period = resolvePeriod(req.query);
    if (!period) {
      res.status(400).json({
        error: "Indica mes (YYYY-MM) o rango desde/hasta (YYYY-MM-DD)",
      });
      return;
    }

    const equipoId =
      typeof req.query.equipo_id === "string" ? Number(req.query.equipo_id) : null;

    const rows =
      equipoId && Number.isFinite(equipoId)
        ? await sql`
            SELECT
              r.id,
              r.equipo_id,
              r.fecha::text AS fecha,
              r.momento,
              to_char(r.hora, 'HH24:MI') AS hora,
              r.temperatura::float AS temperatura,
              r.responsable,
              r.incidencias,
              e.nombre AS equipo_nombre,
              e.tipo AS equipo_tipo,
              e.temp_max::float AS temp_max
            FROM registros r
            JOIN equipos e ON e.id = r.equipo_id
            WHERE r.fecha >= ${period.desde}::date
              AND r.fecha <= ${period.hasta}::date
              AND r.equipo_id = ${equipoId}
            ORDER BY r.fecha ASC, e.orden ASC, e.nombre ASC, r.momento ASC
          `
        : await sql`
            SELECT
              r.id,
              r.equipo_id,
              r.fecha::text AS fecha,
              r.momento,
              to_char(r.hora, 'HH24:MI') AS hora,
              r.temperatura::float AS temperatura,
              r.responsable,
              r.incidencias,
              e.nombre AS equipo_nombre,
              e.tipo AS equipo_tipo,
              e.temp_max::float AS temp_max
            FROM registros r
            JOIN equipos e ON e.id = r.equipo_id
            WHERE r.fecha >= ${period.desde}::date
              AND r.fecha <= ${period.hasta}::date
            ORDER BY r.fecha ASC, e.orden ASC, e.nombre ASC, r.momento ASC
          `;

    const registros = rows.map((row) => ({
      ...row,
      equipo_tipo: row.equipo_tipo as EquipoTipo,
      estado: evaluarTemperatura(
        Number(row.temperatura),
        row.equipo_tipo as EquipoTipo,
        Number(row.temp_max),
      ),
    }));

    res.status(200).json({
      desde: period.desde,
      hasta: period.hasta,
      registros,
    });
    return;
  }

  if (req.method === "POST") {
    if (!requireAuth(req, res)) return;

    const equipoId = Number(req.body?.equipo_id);
    const fecha = typeof req.body?.fecha === "string" ? req.body.fecha : "";
    const momentoRaw = typeof req.body?.momento === "string" ? req.body.momento : "";
    const hora = typeof req.body?.hora === "string" ? req.body.hora : "";
    const temperatura = Number(req.body?.temperatura);
    const responsable =
      typeof req.body?.responsable === "string" ? req.body.responsable.trim().toUpperCase() : "";
    const incidencias =
      typeof req.body?.incidencias === "string" ? req.body.incidencias.trim() : null;

    if (!Number.isFinite(equipoId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      res.status(400).json({ error: "Equipo o fecha invalidos" });
      return;
    }

    if (!isMomento(momentoRaw)) {
      res.status(400).json({ error: "Momento invalido (inicio o fin)" });
      return;
    }

    const hoy = todayMadrid();
    if (fecha > hoy) {
      res.status(400).json({ error: "No se pueden registrar fechas futuras" });
      return;
    }

    const primerIncompleto = await findPrimerDiaIncompleto(sql, hoy);
    if (primerIncompleto && fecha > primerIncompleto) {
      res.status(403).json({
        error: "Completa las lecturas del dia operativo pendiente antes de registrar fechas posteriores",
      });
      return;
    }

    if (!/^\d{2}:\d{2}$/.test(hora)) {
      res.status(400).json({ error: "Hora invalida (HH:MM)" });
      return;
    }

    if (!Number.isFinite(temperatura) || temperatura < -40 || temperatura > 40) {
      res.status(400).json({ error: "Temperatura fuera de rango" });
      return;
    }

    if (!responsable || responsable.length > 20) {
      res.status(400).json({ error: "Responsable requerido (iniciales)" });
      return;
    }

    const equipos = await sql`
      SELECT id, tipo, temp_max::float AS temp_max
      FROM equipos
      WHERE id = ${equipoId} AND activo = TRUE
      LIMIT 1
    `;

    if (!equipos.length) {
      res.status(404).json({ error: "Equipo no encontrado" });
      return;
    }

    const equipo = equipos[0];
    const tipo = equipo.tipo as EquipoTipo;
    const estado = evaluarTemperatura(temperatura, tipo, Number(equipo.temp_max));

    if (estado !== "ok" && !incidencias) {
      res.status(400).json({
        error: "Indica incidencias o acciones correctoras cuando la temperatura esta fuera de rango",
      });
      return;
    }

    const rows = await sql`
      INSERT INTO registros (equipo_id, fecha, momento, hora, temperatura, responsable, incidencias)
      VALUES (
        ${equipoId},
        ${fecha}::date,
        ${momentoRaw},
        ${hora}::time,
        ${temperatura},
        ${responsable},
        ${incidencias || null}
      )
      ON CONFLICT (equipo_id, fecha, momento)
      DO UPDATE SET
        hora = EXCLUDED.hora,
        temperatura = EXCLUDED.temperatura,
        responsable = EXCLUDED.responsable,
        incidencias = EXCLUDED.incidencias,
        updated_at = NOW()
      RETURNING
        id,
        equipo_id,
        fecha::text AS fecha,
        momento,
        to_char(hora, 'HH24:MI') AS hora,
        temperatura::float AS temperatura,
        responsable,
        incidencias
    `;

    res.status(200).json({
      registro: {
        ...rows[0],
        estado: evaluarTemperatura(
          Number(rows[0].temperatura),
          tipo,
          Number(equipo.temp_max),
        ),
      },
    });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Metodo no permitido" });
}
