import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth";
import { getSql } from "../../lib/db";
import { ensureSchema } from "../../lib/ensure-schema";
import { findPrimerDiaIncompleto, todayMadrid, type Momento } from "../../lib/dia-operativo";
import { evaluarTemperatura, type EquipoTipo } from "../../lib/temperatura";

interface RegistroRow {
  id: number;
  equipo_id: number;
  momento: Momento;
  hora: string;
  temperatura: number;
  responsable: string;
  incidencias: string | null;
}

function mapLectura(registro: RegistroRow | undefined, tipo: EquipoTipo, tempMax: number) {
  if (!registro) return null;
  return {
    id: registro.id,
    hora: registro.hora,
    temperatura: registro.temperatura,
    responsable: registro.responsable,
    incidencias: registro.incidencias,
    estado: evaluarTemperatura(registro.temperatura, tipo, tempMax),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Metodo no permitido" });
    return;
  }

  if (!requireAuth(req, res)) return;

  try {
    await ensureSchema();
    const sql = getSql();
  const hoy = todayMadrid();
  const solicitada =
    typeof req.query.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)
      ? req.query.fecha
      : hoy;

  const primerIncompleto = await findPrimerDiaIncompleto(sql, hoy);

  let fecha = solicitada;
  let bloqueado = false;
  let mensajeBloqueo: string | null = null;

  if (primerIncompleto) {
    if (solicitada > primerIncompleto) {
      fecha = primerIncompleto;
      bloqueado = true;
      mensajeBloqueo =
        "Hay lecturas pendientes de dias anteriores. Completa apertura y cierre de todos los equipos antes de continuar.";
    } else if (solicitada === primerIncompleto) {
      bloqueado = true;
      mensajeBloqueo =
        "Dia operativo pendiente: registra la apertura y el cierre de cada equipo para poder pasar al dia siguiente.";
    }
  }

  if (fecha > hoy) {
    fecha = primerIncompleto ?? hoy;
  }

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
      r.momento,
      to_char(r.hora, 'HH24:MI') AS hora,
      r.temperatura::float AS temperatura,
      r.responsable,
      r.incidencias
    FROM registros r
    WHERE r.fecha = ${fecha}::date
  `;

  const byEquipoMomento = new Map<string, RegistroRow>();
  for (const row of registros) {
    byEquipoMomento.set(`${row.equipo_id}:${row.momento}`, row as RegistroRow);
  }

  const items = equipos.map((equipo) => {
    const tipo = equipo.tipo as EquipoTipo;
    const tempMax = Number(equipo.temp_max);
    const inicio = mapLectura(
      byEquipoMomento.get(`${equipo.id}:inicio`),
      tipo,
      tempMax,
    );
    const fin = mapLectura(byEquipoMomento.get(`${equipo.id}:fin`), tipo, tempMax);
    const completo = Boolean(inicio && fin);

    return {
      equipo: {
        id: equipo.id,
        nombre: equipo.nombre,
        tipo,
        temp_max: tempMax,
        orden: equipo.orden,
      },
      inicio,
      fin,
      pendiente_inicio: !inicio,
      pendiente_fin: !fin,
      completo,
      pendiente: !completo,
    };
  });

  const diaCompleto = items.every((i) => i.completo);
  const bloqueoFinal =
    Boolean(primerIncompleto && fecha === primerIncompleto && !diaCompleto) ||
    Boolean(primerIncompleto && solicitada > primerIncompleto);

  res.status(200).json({
    fecha,
    hoy,
    bloqueado: bloqueoFinal,
    mensaje_bloqueo: bloqueoFinal ? mensajeBloqueo : null,
    dia_completo: diaCompleto,
    puede_siguiente_dia: diaCompleto && fecha < hoy,
    primer_dia_incompleto: primerIncompleto,
    items,
  });
  } catch (err) {
    console.error("dashboard error:", err);
    res.status(500).json({ error: "Error al cargar el panel" });
  }
}
