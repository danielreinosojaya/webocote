import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readComprasSessionToken, verifyComprasSessionToken } from "../../lib/compras-auth.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Metodo no permitido" });
    return;
  }

  const authenticated = verifyComprasSessionToken(readComprasSessionToken(req));
  res.status(200).json({ authenticated });
}
