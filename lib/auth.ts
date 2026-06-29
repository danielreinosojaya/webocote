import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const COOKIE_NAME = "ocote_temp_auth";
const SESSION_HOURS = 12;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.TEMPERATURA_PIN;
  if (!secret) {
    throw new Error("SESSION_SECRET o TEMPERATURA_PIN requerido");
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expires);
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  if (!expStr || !sig) return false;
  const expires = Number(expStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = sign(expStr);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function getPinFromEnv(): string {
  const pin = process.env.TEMPERATURA_PIN;
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    throw new Error("TEMPERATURA_PIN debe ser un cdigo numrico de 4 a 6 dgitos");
  }
  return pin;
}

export function verifyPin(input: string): boolean {
  try {
    const expected = getPinFromEnv();
    if (!/^\d{4,6}$/.test(input)) return false;
    if (input.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(input), Buffer.from(expected));
  } catch {
    return false;
  }
}

function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function setSessionCookie(res: VercelResponse, token: string): void {
  const maxAge = SESSION_HOURS * 60 * 60;
  const secure = isProduction() ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
  );
}

export function clearSessionCookie(res: VercelResponse): void {
  const secure = isProduction() ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}

export function readSessionToken(req: VercelRequest): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) {
      return rest.join("=");
    }
  }
  return undefined;
}

export function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  if (verifySessionToken(readSessionToken(req))) {
    return true;
  }
  res.status(401).json({ error: "No autorizado" });
  return false;
}
