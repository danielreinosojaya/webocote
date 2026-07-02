import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearComprasSessionCookie,
  createComprasSessionToken,
  setComprasSessionCookie,
  verifyComprasPin,
} from "../../lib/compras-auth.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") {
    const pin = typeof req.body?.pin === "string" ? req.body.pin.trim() : "";
    if (!verifyComprasPin(pin)) {
      res.status(401).json({ error: "Codigo incorrecto" });
      return;
    }
    const token = createComprasSessionToken();
    setComprasSessionCookie(res, token);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    clearComprasSessionCookie(res);
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "POST, DELETE");
  res.status(405).json({ error: "Metodo no permitido" });
}
