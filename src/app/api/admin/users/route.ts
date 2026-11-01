import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  generateTotpSecret,
  getAdminForApi,
  getUserByEmail,
  hashPassword,
  isValidEmail,
  toSafeUser,
  totpUri,
} from "@/lib/auth";
import { publish } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getAdminForApi(request))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  return NextResponse.json(rows.map(toSafeUser));
}

/**
 * Criação de contas pelo painel — único lugar do sistema onde uma conta
 * admin pode nascer, e somente se quem chama já é admin autenticado.
 */
export async function POST(request: Request) {
  if (!(await getAdminForApi(request))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 80);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = body.role === "admin" ? "admin" : "user";
  const plan = body.plan === "vip" ? "vip" : "free";
  const vipDays = Number(body.vipDays ?? 0);

  if (!name) {
    return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "A senha precisa ter pelo menos 8 caracteres." },
      { status: 400 },
    );
  }
  if (await getUserByEmail(email)) {
    return NextResponse.json(
      { error: "Já existe uma conta com este e-mail." },
      { status: 409 },
    );
  }

  // contas admin nascem com 2FA obrigatório
  const totpSecret = role === "admin" ? generateTotpSecret() : null;

  const vipUntil =
    plan === "vip" && vipDays > 0
      ? new Date(Date.now() + vipDays * 86_400_000)
      : null;

  const [created] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash: hashPassword(password),
      totpSecret,
      role,
      plan,
      status: "active",
      vipUntil,
    })
    .returning();

  publish({ type: "users", action: "created", id: created.id });

  // o QR do 2FA é exibido uma única vez, no momento da criação
  let qr: string | null = null;
  if (totpSecret) {
    qr = await QRCode.toDataURL(totpUri(email, totpSecret), {
      margin: 1,
      width: 300,
      color: { dark: "#0a0a0d", light: "#ffffff" },
    });
  }

  return NextResponse.json(
    { user: toSafeUser(created), qr, secret: totpSecret },
    { status: 201 },
  );
}
