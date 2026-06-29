import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readSessionToken, verifySessionToken } from "../../lib/auth.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const authenticated = verifySessionToken(readSessionToken(req));
  res.status(200).json({ authenticated });
}
