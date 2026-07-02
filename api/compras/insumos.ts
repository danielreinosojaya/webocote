import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireComprasAuth } from "../../lib/compras-auth.js";
import { ensureComprasSchema } from "../../lib/ensure-compras-schema.js";
import { getSql } from "../../lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureComprasSchema();
  } catch (err) {
    console.error("schema error:", err);
    res.status(500).json({ error: "Error de base de datos" });
    return;
  }

  const sql = getSql();

  if (req.method === "GET") {
    if (!requireComprasAuth(req, res)) return;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const rows = q
      ? await sql`
          SELECT id, nombre, unidad, categoria
          FROM insumos
          WHERE nombre ILIKE ${"%" + q + "%"}
          ORDER BY nombre ASC
          LIMIT 50
        `
      : await sql`
          SELECT id, nombre, unidad, categoria
          FROM insumos
          ORDER BY nombre ASC
        `;

    res.status(200).json({ insumos: rows });
    return;
  }

  if (req.method === "POST") {
    if (!requireComprasAuth(req, res)) return;

    const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
    const unidad = typeof req.body?.unidad === "string" ? req.body.unidad.trim().toLowerCase() : "ud";
    const categoria =
      typeof req.body?.categoria === "string" ? req.body.categoria.trim() : null;

    if (!nombre) {
      res.status(400).json({ error: "Nombre de insumo requerido" });
      return;
    }

    const rows = await sql`
      INSERT INTO insumos (nombre, unidad, categoria)
      VALUES (${nombre}, ${unidad}, ${categoria})
      ON CONFLICT (nombre) DO UPDATE SET unidad = EXCLUDED.unidad
      RETURNING id, nombre, unidad, categoria
    `;

    res.status(200).json({ insumo: rows[0] });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Metodo no permitido" });
}
