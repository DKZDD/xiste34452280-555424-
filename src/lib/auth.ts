import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { generateSecret, generateURI, verifySync } from "otplib";
import { db } from "@/db";
import { users, type SafeUser, type User } from "@/db/schema";

/* ---------------------------- TOTP (2FA) ---------------------------- */

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpUri(email: string, secret: string): string {
  return generateURI({ issuer: "DuckeFlix", label: email, secret });
}

/**
 * Valida o código de 6 dígitos. Se o navegador informar o próprio relógio
 * (`epochMs`), usamos ele como referência — assim o código do celular é
 * aceito mesmo com o relógio do servidor dessincronizado.
 */
export function checkTotp(
  code: string,
  secret: string,
  epochMs?: number,
): boolean {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const useClientClock =
      typeof epochMs === "number" &&
      Number.isFinite(epochMs) &&
      epochMs > 946_684_800_000;
    return verifySync({
      token,
      secret,
      epochTolerance: 90,
      ...(useClientClock ? { epoch: Math.floor(epochMs / 1000) } : {}),
    }).valid;
  } catch {
    return false;
  }
}

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "duckeflix-dev-auth-secret-change-in-production",
);

export const SESSION_COOKIE = "ducke_session";
export const PRE_COOKIE = "ducke_pre";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

/* ------------------------------ senhas ------------------------------ */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return test.length === expected.length && timingSafeEqual(test, expected);
}

export { isGmail } from "@/lib/auth-helpers";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/* ------------------------------- VIP -------------------------------- */

export function isVipActive(user: {
  plan: string;
  vipUntil: Date | null;
}): boolean {
  if (user.plan !== "vip") return false;
  if (!user.vipUntil) return true; // vitalício
  return user.vipUntil.getTime() > Date.now();
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    status: user.status,
    vipUntil: user.vipUntil ? user.vipUntil.toISOString() : null,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    isVip: isVipActive(user),
    has2fa: Boolean(user.totpSecret),
  };
}

/* ---------------------------- tokens JWT ---------------------------- */

async function signToken(payload: Record<string, unknown>, exp: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(SECRET);
}

async function readToken<T extends Record<string, unknown>>(
  token: string | undefined,
  purpose: string,
): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.purpose !== purpose) return null;
    return payload as unknown as T;
  } catch {
    return null;
  }
}

export function cookieOptions(request: Request, maxAge: number) {
  const forwarded = request.headers.get("x-forwarded-proto");
  const proto = forwarded ?? new URL(request.url).protocol.replace(":", "");
  const isHttps = proto === "https";
  return {
    httpOnly: true,
    // SameSite=None permite o cookie em iframes de outro domínio (preview)
    sameSite: isHttps ? ("none" as const) : ("lax" as const),
    secure: isHttps,
    path: "/",
    maxAge,
  };
}

export const createSessionToken = (userId: number) =>
  signToken({ sub: String(userId), purpose: "session" }, "7d");

export const createPreToken = (userId: number) =>
  signToken({ sub: String(userId), purpose: "pre" }, "5m");

export async function readPreToken(token: string | undefined) {
  const payload = await readToken<{ sub?: string }>(token, "pre");
  const id = Number(payload?.sub);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function readSessionToken(
  token: string | undefined,
): Promise<number | null> {
  const payload = await readToken<{ sub?: string }>(token, "session");
  const id = Number(payload?.sub);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/* ----------------------------- consultas ---------------------------- */

export async function getUserById(id: number): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return user ?? null;
}

export async function countAdmins(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users);
  const all = await db.select().from(users);
  void rows;
  return all.filter((u) => u.role === "admin").length;
}

/** Sessão a partir do cookie httpOnly (Server Components). */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const id = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const user = await getUserById(id);
  if (!user || user.status === "suspended") return null;
  return user;
}

/**
 * Autentica uma rota de API por DOIS canais: header Authorization Bearer
 * (imune a bloqueio de cookies em iframes) ou o cookie httpOnly.
 */
export async function getUserForApi(request: Request): Promise<User | null> {
  const authz = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authz);
  if (match) {
    const id = await readSessionToken(match[1].trim());
    if (id) {
      const user = await getUserById(id);
      if (user && user.status !== "suspended") return user;
    }
  }
  return getSessionUser();
}

/** Exige uma conta admin ativa. */
export async function getAdminForApi(request: Request): Promise<User | null> {
  const user = await getUserForApi(request);
  return user && user.role === "admin" ? user : null;
}

/* --------------------------- rate limiting --------------------------- */

const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimitOk(
  key: string,
  maxAttempts: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) return false;
  entry.count += 1;
  return true;
}
