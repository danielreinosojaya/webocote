import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearSessionCookie,
  createSessionToken,
  setSessionCookie,
  verifyPin,
} from "../../lib/auth.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") {
    const pin = typeof req.body?.pin === "string" ? req.body.pin.trim() : "";
    if (!verifyPin(pin)) {
      res.status(401).json({ error: "Código incorrecto" });
      return;
    }
    const token = createSessionToken();
    setSessionCookie(res, token);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "POST, DELETE");
  res.status(405).json({ error: "Método no permitido" });
}
