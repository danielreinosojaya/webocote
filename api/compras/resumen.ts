import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireComprasAuth } from "../../lib/compras-auth.js";
import { parseMonth, monthBounds } from "../../lib/compras.js";
import { ensureComprasSchema } from "../../lib/ensure-compras-schema.js";
import { getSql } from "../../lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Metodo no permitido" });
    return;
  }

  if (!requireComprasAuth(req, res)) return;

  try {
    await ensureComprasSchema();
  } catch (err) {
    console.error("schema error:", err);
    res.status(500).json({ error: "Error de base de datos" });
    return;
  }

  const sql = getSql();

  const mes = parseMonth(typeof req.query.mes === "string" ? req.query.mes : undefined);
  if (!mes) {
    res.status(400).json({ error: "Indica mes (YYYY-MM)" });
    return;
  }

  const periodo = `${mes.year}-${String(mes.month).padStart(2, "0")}`;
  const period = monthBounds(mes);

  const proveedorId =
    typeof req.query.proveedor_id === "string" ? Number(req.query.proveedor_id) : null;

  const rows =
    proveedorId && Number.isFinite(proveedorId)
      ? await sql`
          SELECT
            l.insumo_id,
            COALESCE(i.nombre, l.descripcion_original) AS insumo_nombre,
            l.unidad,
            SUM(l.cantidad)::float AS cantidad_total,
            COALESCE(SUM(l.total), 0)::float AS gasto_total,
            COUNT(l.id)::int AS num_lineas
          FROM lineas_compra l
          JOIN albaranes a ON a.id = l.albaran_id
          LEFT JOIN insumos i ON i.id = l.insumo_id
          WHERE a.periodo = ${periodo}
            AND a.estado = 'confirmado'
            AND a.proveedor_id = ${proveedorId}
          GROUP BY l.insumo_id, i.nombre, l.descripcion_original, l.unidad
          ORDER BY gasto_total DESC, insumo_nombre ASC
        `
      : await sql`
          SELECT
            l.insumo_id,
            COALESCE(i.nombre, l.descripcion_original) AS insumo_nombre,
            l.unidad,
            SUM(l.cantidad)::float AS cantidad_total,
            COALESCE(SUM(l.total), 0)::float AS gasto_total,
            COUNT(l.id)::int AS num_lineas
          FROM lineas_compra l
          JOIN albaranes a ON a.id = l.albaran_id
          LEFT JOIN insumos i ON i.id = l.insumo_id
          WHERE a.periodo = ${periodo}
            AND a.estado = 'confirmado'
          GROUP BY l.insumo_id, i.nombre, l.descripcion_original, l.unidad
          ORDER BY gasto_total DESC, insumo_nombre ASC
        `;

  const totales = await sql`
    SELECT
      COUNT(DISTINCT a.id)::int AS num_albaranes,
      COALESCE(SUM(l.total), 0)::float AS gasto_total,
      COUNT(l.id)::int AS num_lineas
    FROM albaranes a
    LEFT JOIN lineas_compra l ON l.albaran_id = a.id
    WHERE a.periodo = ${periodo}
      AND a.estado = 'confirmado'
  `;

  res.status(200).json({
    periodo,
    desde: period.desde,
    hasta: period.hasta,
    resumen: rows,
    totales: totales[0],
  });
}
