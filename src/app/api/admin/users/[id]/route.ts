import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import {
  generateTotpSecret,
  getAdminForApi,
  getUserById,
  hashPassword,
  toSafeUser,
  totpUri,
} from "@/lib/auth";
import { publish } from "@/lib/events";

export const dynamic = "force-dynamic";

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function countActiveAdmins(): Promise<number> {
  const all = await db.select().from(users);
  return all.filter((u) => u.role === "admin" && u.status === "active").length;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminForApi(request);
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const patch: Partial<User> = {};
  let newQr: string | null = null;
  let newSecret: string | null = null;

  /* ------------------------------ VIP ------------------------------ */
  if ("plan" in body) {
    const plan = body.plan === "vip" ? "vip" : "free";
    patch.plan = plan;
    if (plan === "vip") {
      const days = Number(body.vipDays ?? 0);
      patch.vipUntil = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
    } else {
      patch.vipUntil = null;
    }
  }

  /* ----------------------------- status ---------------------------- */
  if ("status" in body) {
    const status = body.status === "suspended" ? "suspended" : "active";
    if (target.id === admin.id && status === "suspended") {
      return NextResponse.json(
        { error: "Você não pode suspender a própria conta." },
        { status: 400 },
      );
    }
    if (
      status === "suspended" &&
      target.role === "admin" &&
      target.status === "active" &&
      (await countActiveAdmins()) <= 1
    ) {
      return NextResponse.json(
        { error: "É preciso manter ao menos um administrador ativo." },
        { status: 400 },
      );
    }
    patch.status = status;
  }

  /* ------------------------------ papel ---------------------------- */
  if ("role" in body) {
    const role = body.role === "admin" ? "admin" : "user";
    if (target.id === admin.id && role !== "admin") {
      return NextResponse.json(
        { error: "Você não pode remover o próprio acesso de administrador." },
        { status: 400 },
      );
    }
    if (
      role === "user" &&
      target.role === "admin" &&
      target.status === "active" &&
      (await countActiveAdmins()) <= 1
    ) {
      return NextResponse.json(
        { error: "É preciso manter ao menos um administrador ativo." },
        { status: 400 },
      );
    }
    patch.role = role;

    // ao promover a admin, gera o 2FA obrigatório (QR exibido uma vez)
    if (role === "admin" && !target.totpSecret) {
      newSecret = generateTotpSecret();
      patch.totpSecret = newSecret;
      newQr = await QRCode.toDataURL(totpUri(target.email, newSecret), {
        margin: 1,
        width: 300,
        color: { dark: "#0a0a0d", light: "#ffffff" },
      });
    }
  }

  /* ---------------------------- cadastro --------------------------- */
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 80);
  }
  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "A senha precisa ter pelo menos 8 caracteres." },
        { status: 400 },
      );
    }
    patch.passwordHash = hashPassword(body.password);
  }

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning();

  publish({ type: "users", action: "updated", id });

  return NextResponse.json({
    user: toSafeUser(updated),
    qr: newQr,
    secret: newSecret,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminForApi(request);
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  if (id === admin.id) {
    return NextResponse.json(
      { error: "Você não pode excluir a própria conta." },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  // só bloqueia se a exclusão deixaria o sistema sem nenhum admin ativo
  if (
    target.role === "admin" &&
    target.status === "active" &&
    (await countActiveAdmins()) <= 1
  ) {
    return NextResponse.json(
      { error: "É preciso manter ao menos um administrador ativo." },
      { status: 400 },
    );
  }

  await db.delete(users).where(eq(users.id, id));
  publish({ type: "users", action: "deleted", id });

  return NextResponse.json({ ok: true });
}
