import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireComprasAuth } from "../../lib/compras-auth.js";
import { normalizeText } from "../../lib/compras.js";
import { ensureComprasSchema } from "../../lib/ensure-compras-schema.js";
import { getSql } from "../../lib/db.js";

async function upsertInsumo(
  sql: ReturnType<typeof getSql>,
  nombre: string,
  unidad: string,
): Promise<number> {
  const rows = await sql`
    INSERT INTO insumos (nombre, unidad)
    VALUES (${nombre.trim()}, ${unidad.trim() || "ud"})
    ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id
  `;
  return rows[0].id as number;
}

async function findMapeo(
  sql: ReturnType<typeof getSql>,
  descripcion: string,
  proveedorId: number | null,
): Promise<number | null> {
  const texto = normalizeText(descripcion);
  const exact = await sql`
    SELECT insumo_id FROM mapeo_descripciones
    WHERE texto_original = ${texto}
      AND (proveedor_id = ${proveedorId} OR proveedor_id IS NULL)
    ORDER BY proveedor_id NULLS LAST
    LIMIT 1
  `;
  if (exact.length) return exact[0].insumo_id as number;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureComprasSchema();
  } catch (err) {
    console.error("schema error:", err);
    res.status(500).json({ error: "Error de base de datos" });
    return;
  }

  if (!requireComprasAuth(req, res)) return;

  const sql = getSql();
  const id = Number(req.query.id ?? req.body?.id);

  if (req.method === "PUT") {
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "ID de linea requerido" });
      return;
    }

    const desc = typeof req.body?.descripcion_original === "string"
      ? req.body.descripcion_original.trim()
      : "";
    const cantidad = Number(req.body?.cantidad);
    const unidad = typeof req.body?.unidad === "string" ? req.body.unidad.trim().toLowerCase() : "ud";
    const precio_unitario = req.body?.precio_unitario != null ? Number(req.body.precio_unitario) : null;
    const total = req.body?.total != null ? Number(req.body.total) : null;
    let insumoId: number | null = req.body?.insumo_id != null ? Number(req.body.insumo_id) : null;
    const insumoNombre = typeof req.body?.insumo_nombre === "string" ? req.body.insumo_nombre.trim() : "";

    if (!desc || !Number.isFinite(cantidad) || cantidad <= 0) {
      res.status(400).json({ error: "Descripcion y cantidad validas son obligatorias" });
      return;
    }

    const existing = await sql`
      SELECT l.id, a.proveedor_id
      FROM lineas_compra l
      JOIN albaranes a ON a.id = l.albaran_id
      WHERE l.id = ${id}
      LIMIT 1
    `;
    if (!existing.length) {
      res.status(404).json({ error: "Linea no encontrada" });
      return;
    }

    const proveedorId = existing[0].proveedor_id as number | null;

    if (!insumoId && insumoNombre) {
      insumoId = await upsertInsumo(sql, insumoNombre, unidad);
    }
    if (!insumoId) {
      insumoId = await findMapeo(sql, desc, proveedorId);
    }

    if (insumoId && proveedorId) {
      const textoNorm = normalizeText(desc);
      await sql`
        INSERT INTO mapeo_descripciones (texto_original, proveedor_id, insumo_id)
        VALUES (${textoNorm}, ${proveedorId}, ${insumoId})
        ON CONFLICT (texto_original, proveedor_id) DO UPDATE SET insumo_id = EXCLUDED.insumo_id
      `;
    }

    const rows = await sql`
      UPDATE lineas_compra SET
        descripcion_original = ${desc},
        cantidad = ${cantidad},
        unidad = ${unidad},
        precio_unitario = ${precio_unitario},
        total = ${total},
        insumo_id = ${insumoId}
      WHERE id = ${id}
      RETURNING
        id, descripcion_original, cantidad::float AS cantidad, unidad,
        precio_unitario::float AS precio_unitario, total::float AS total, insumo_id
    `;

    const insumo = insumoId
      ? await sql`SELECT nombre FROM insumos WHERE id = ${insumoId} LIMIT 1`
      : [];

    res.status(200).json({
      linea: {
        ...rows[0],
        insumo_nombre: insumo.length ? insumo[0].nombre : null,
      },
    });
    return;
  }

  if (req.method === "DELETE") {
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "ID de linea requerido" });
      return;
    }

    const deleted = await sql`
      DELETE FROM lineas_compra WHERE id = ${id} RETURNING id
    `;
    if (!deleted.length) {
      res.status(404).json({ error: "Linea no encontrada" });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "PUT, DELETE");
  res.status(405).json({ error: "Metodo no permitido" });
}
