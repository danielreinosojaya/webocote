import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth.js";
import { getSql } from "../../lib/db.js";
import { tempMaxForTipo, type EquipoTipo } from "../../lib/temperatura.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = getSql();

  if (req.method === "GET") {
    if (!requireAuth(req, res)) return;

    const rows = await sql`
      SELECT id, nombre, tipo, temp_max::float AS temp_max, activo, orden
      FROM equipos
      WHERE activo = TRUE
      ORDER BY orden ASC, nombre ASC
    `;
    res.status(200).json({ equipos: rows });
    return;
  }

  if (req.method === "POST") {
    if (!requireAuth(req, res)) return;

    const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
    const tipo = req.body?.tipo as EquipoTipo | undefined;

    if (!nombre || nombre.length > 100) {
      res.status(400).json({ error: "Nombre de equipo inválido" });
      return;
    }

    if (!tipo || !["refrigeracion", "congelacion", "vegetales"].includes(tipo)) {
      res.status(400).json({ error: "Tipo de equipo inválido" });
      return;
    }

    const tempMax =
      typeof req.body?.temp_max === "number" ? req.body.temp_max : tempMaxForTipo(tipo);

    const rows = await sql`
      INSERT INTO equipos (nombre, tipo, temp_max, orden)
      VALUES (
        ${nombre},
        ${tipo},
        ${tempMax},
        COALESCE((SELECT MAX(orden) + 1 FROM equipos), 0)
      )
      RETURNING id, nombre, tipo, temp_max::float AS temp_max, activo, orden
    `;

    res.status(201).json({ equipo: rows[0] });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Método no permitido" });
}
