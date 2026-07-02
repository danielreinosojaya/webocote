import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireComprasAuth } from "../../lib/compras-auth.js";
import { normalizeText, parseDate, parseMonth, monthBounds } from "../../lib/compras.js";
import { ensureComprasSchema } from "../../lib/ensure-compras-schema.js";
import { getSql } from "../../lib/db.js";

interface LineaInput {
  descripcion_original: string;
  cantidad: number;
  unidad: string;
  precio_unitario?: number | null;
  total?: number | null;
  insumo_id?: number | null;
  insumo_nombre?: string | null;
}

async function upsertProveedor(
  sql: ReturnType<typeof getSql>,
  nombre: string,
): Promise<number | null> {
  const trimmed = nombre.trim();
  if (!trimmed) return null;

  const rows = await sql`
    INSERT INTO proveedores (nombre)
    VALUES (${trimmed})
    ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id
  `;
  return rows[0].id as number;
}

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

  const sql = getSql();

  if (req.method === "GET") {
    if (!requireComprasAuth(req, res)) return;

    const detailId = Number(req.query.id);
    if (Number.isFinite(detailId)) {
      const albaran = await sql`
        SELECT id, proveedor_nombre, proveedor_id, fecha::text AS fecha, numero, estado, notas, metodo_extraccion
        FROM albaranes WHERE id = ${detailId} LIMIT 1
      `;
      if (!albaran.length) {
        res.status(404).json({ error: "Albaran no encontrado" });
        return;
      }
      const lineas = await sql`
        SELECT
          l.id, l.descripcion_original, l.cantidad::float AS cantidad, l.unidad,
          l.precio_unitario::float AS precio_unitario, l.total::float AS total,
          l.insumo_id, i.nombre AS insumo_nombre
        FROM lineas_compra l
        LEFT JOIN insumos i ON i.id = l.insumo_id
        WHERE l.albaran_id = ${detailId}
        ORDER BY l.id ASC
      `;
      res.status(200).json({ albaran: albaran[0], lineas });
      return;
    }

    const mes = parseMonth(typeof req.query.mes === "string" ? req.query.mes : undefined);

    if (!mes) {
      res.status(400).json({ error: "Indica mes (YYYY-MM)" });
      return;
    }

    const period = monthBounds(mes);

    const rows = await sql`
      SELECT
        a.id,
        a.proveedor_nombre,
        a.proveedor_id,
        a.fecha::text AS fecha,
        a.periodo,
        a.numero,
        a.estado,
        a.notas,
        a.metodo_extraccion,
        COUNT(l.id)::int AS lineas_count,
        COALESCE(SUM(l.total), 0)::float AS total_importe
      FROM albaranes a
      LEFT JOIN lineas_compra l ON l.albaran_id = a.id
      WHERE a.periodo = ${mes}
      GROUP BY a.id
      ORDER BY a.fecha DESC, a.id DESC
    `;

    res.status(200).json({ desde: period.desde, hasta: period.hasta, albaranes: rows });
    return;
  }

  if (req.method === "POST") {
    if (!requireComprasAuth(req, res)) return;

    const proveedorNombre =
      typeof req.body?.proveedor_nombre === "string" ? req.body.proveedor_nombre.trim() : "";
    const fecha = typeof req.body?.fecha === "string" ? req.body.fecha : "";
    const numero = typeof req.body?.numero === "string" ? req.body.numero.trim() : null;
    const notas = typeof req.body?.notas === "string" ? req.body.notas.trim() : null;
    const metodo =
      typeof req.body?.metodo_extraccion === "string" ? req.body.metodo_extraccion : null;
    const periodo = typeof req.body?.periodo === "string" ? req.body.periodo : "";
    const lineas: LineaInput[] = Array.isArray(req.body?.lineas) ? req.body.lineas : [];

    if (!proveedorNombre || !parseDate(fecha)) {
      res.status(400).json({ error: "Proveedor y fecha son obligatorios" });
      return;
    }

    if (!parseMonth(periodo)) {
      res.status(400).json({ error: "Periodo contable invalido (YYYY-MM)" });
      return;
    }

    if (!lineas.length) {
      res.status(400).json({ error: "El albaran debe tener al menos una linea" });
      return;
    }

    const proveedorId = await upsertProveedor(sql, proveedorNombre);

    const albaranRows = await sql`
      INSERT INTO albaranes (proveedor_id, proveedor_nombre, fecha, numero, estado, notas, metodo_extraccion, periodo)
      VALUES (
        ${proveedorId},
        ${proveedorNombre},
        ${fecha}::date,
        ${numero},
        'confirmado',
        ${notas},
        ${metodo},
        ${periodo}
      )
      RETURNING id, proveedor_nombre, fecha::text AS fecha, periodo, numero, estado
    `;

    const albaranId = albaranRows[0].id as number;
    const lineasGuardadas = [];

    for (const linea of lineas) {
      const desc = String(linea.descripcion_original ?? "").trim();
      const cantidad = Number(linea.cantidad);
      const unidad = String(linea.unidad ?? "ud").trim().toLowerCase();

      if (!desc || !Number.isFinite(cantidad) || cantidad <= 0) continue;

      let insumoId: number | null = linea.insumo_id ?? null;

      if (!insumoId && linea.insumo_nombre) {
        insumoId = await upsertInsumo(sql, linea.insumo_nombre, unidad);
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
        INSERT INTO lineas_compra (
          albaran_id, insumo_id, descripcion_original, cantidad, unidad, precio_unitario, total
        )
        VALUES (
          ${albaranId},
          ${insumoId},
          ${desc},
          ${cantidad},
          ${unidad},
          ${linea.precio_unitario ?? null},
          ${linea.total ?? null}
        )
        RETURNING id, descripcion_original, cantidad::float AS cantidad, unidad, insumo_id
      `;
      lineasGuardadas.push(rows[0]);
    }

    res.status(200).json({ albaran: albaranRows[0], lineas: lineasGuardadas });
    return;
  }

  if (req.method === "DELETE") {
    if (!requireComprasAuth(req, res)) return;

    const id = Number(req.query.id ?? req.body?.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "ID de albaran requerido" });
      return;
    }

    await sql`DELETE FROM albaranes WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  res.status(405).json({ error: "Metodo no permitido" });
}
