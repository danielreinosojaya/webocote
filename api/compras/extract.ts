import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireComprasAuth } from "../../lib/compras-auth.js";
import { extractFromImages, extractFromText } from "../../lib/extract-albaran.js";

const MIN_TEXT_CHARS = 80;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Metodo no permitido" });
    return;
  }

  if (!requireComprasAuth(req, res)) return;

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const pages = Array.isArray(req.body?.pages)
    ? (req.body.pages as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  const forzarVision = req.body?.forzar_vision === true;

  try {
    let resultado;

    if (forzarVision || (text.length < MIN_TEXT_CHARS && pages.length > 0)) {
      if (!pages.length) {
        res.status(400).json({
          error: "PDF escaneado sin imagenes. Vuelve a subir el archivo.",
        });
        return;
      }
      resultado = await extractFromImages(pages);
    } else if (text.length >= MIN_TEXT_CHARS) {
      resultado = await extractFromText(text);
    } else if (pages.length > 0) {
      resultado = await extractFromImages(pages);
    } else {
      res.status(400).json({
        error: "No se pudo leer el documento. Sube un PDF con texto o una imagen escaneada.",
      });
      return;
    }

    res.status(200).json({ extraccion: resultado });
  } catch (err) {
    console.error("extract error:", err);
    const msg = err instanceof Error ? err.message : "Error al extraer datos";
    res.status(500).json({ error: msg });
  }
}
