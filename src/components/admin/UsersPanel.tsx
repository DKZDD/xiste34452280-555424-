"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Ban,
  Copy,
  Crown,
  Loader2,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { SafeUser } from "@/db/schema";
import { authHeaders } from "@/lib/session";
import { cn } from "@/lib/utils";

type CreatedSecret = { email: string; qr: string; secret: string } | null;

export function UsersPanel({
  users,
  currentAdminId,
  onChanged,
}: {
  users: SafeUser[];
  currentAdminId: number;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [createdSecret, setCreatedSecret] = useState<CreatedSecret>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
    plan: "free",
    vipDays: "30",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!modalOpen && !createdSecret) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [modalOpen, createdSecret]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  async function patchUser(id: number, payload: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Não foi possível atualizar.");
        return null;
      }
      onChanged();
      return data;
    } catch {
      toast.error("Erro de conexão.");
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function toggleVip(u: SafeUser) {
    const makeVip = u.plan !== "vip";
    const data = await patchUser(u.id, {
      plan: makeVip ? "vip" : "free",
      vipDays: 0, // VIP vitalício; use o formulário para definir prazo
    });
    if (data) {
      toast.success(
        makeVip
          ? `${u.name || u.email} agora é VIP 👑`
          : `VIP removido de ${u.name || u.email}.`,
      );
    }
  }

  async function toggleSuspend(u: SafeUser) {
    const suspend = u.status !== "suspended";
    const data = await patchUser(u.id, {
      status: suspend ? "suspended" : "active",
    });
    if (data) {
      toast.success(
        suspend ? "Conta suspensa." : "Conta reativada com sucesso.",
      );
    }
  }

  async function toggleAdmin(u: SafeUser) {
    const makeAdmin = u.role !== "admin";
    const data = await patchUser(u.id, { role: makeAdmin ? "admin" : "user" });
    if (data) {
      if (makeAdmin && data.qr) {
        setCreatedSecret({ email: u.email, qr: data.qr, secret: data.secret });
        toast.success("Admin promovido! Configure o 2FA abaixo.");
      } else {
        toast.success(
          makeAdmin ? "Acesso de admin concedido." : "Acesso de admin removido.",
        );
      }
    }
  }

  async function removeUser(u: SafeUser) {
    if (confirmDeleteId !== u.id) {
      setConfirmDeleteId(u.id);
      setTimeout(
        () => setConfirmDeleteId((id) => (id === u.id ? null : id)),
        3500,
      );
      return;
    }
    setConfirmDeleteId(null);
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Não foi possível excluir.");
        return;
      }
      toast.success("Conta excluída.");
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          ...form,
          vipDays: form.plan === "vip" ? Number(form.vipDays || 0) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Não foi possível criar a conta.");
        return;
      }
      toast.success("Conta criada com sucesso!");
      setModalOpen(false);
      setForm({
        name: "",
        email: "",
        password: "",
        role: "user",
        plan: "free",
        vipDays: "30",
      });
      if (data.qr) {
        setCreatedSecret({
          email: data.user.email,
          qr: data.qr,
          secret: data.secret,
        });
      }
      onChanged();
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="focus-duck w-72 rounded-md border border-white/10 bg-panel py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500"
          />
        </div>
        <span className="text-xs text-zinc-500">
          {filtered.length} de {users.length} contas
        </span>
        <button
          onClick={() => setModalOpen(true)}
          className="focus-duck ml-auto inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-extrabold text-black transition hover:bg-brand-300"
        >
          <Plus className="h-4 w-4" />
          Nova conta
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-panel">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-semibold">Conta</th>
              <th className="px-4 py-3 font-semibold">Plano</th>
              <th className="px-4 py-3 font-semibold">Situação</th>
              <th className="px-4 py-3 font-semibold">Papel</th>
              <th className="px-4 py-3 font-semibold">Criada em</th>
              <th className="px-4 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isSelf = u.id === currentAdminId;
              const busy = busyId === u.id;
              return (
                <tr
                  key={u.id}
                  className="border-b border-white/5 transition last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold uppercase",
                          u.isVip
                            ? "bg-brand text-black"
                            : "bg-panel-2 text-zinc-400",
                        )}
                      >
                        {(u.name || u.email).slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-semibold text-white">
                          {u.name || "—"}
                          {isSelf && (
                            <span className="rounded bg-white/10 px-1.5 text-[10px] font-bold text-zinc-300">
                              você
                            </span>
                          )}
                        </p>
                        <p className="max-w-[230px] truncate text-xs text-zinc-500">
                          {u.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {u.isVip ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 text-xs font-bold text-brand">
                        <Crown className="h-3.5 w-3.5" />
                        VIP
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Grátis</span>
                    )}
                    {u.vipUntil && u.isVip && (
                      <p className="mt-1 text-[10px] text-zinc-600">
                        até {new Date(u.vipUntil).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {u.status === "suspended" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-400">
                        <Ban className="h-3.5 w-3.5" />
                        Suspensa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Ativa
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {u.role === "admin" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-300">
                        <Shield className="h-3.5 w-3.5" />
                        Admin
                        {u.has2fa && <ShieldCheck className="h-3 w-3" />}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Usuário</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {busy && (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin text-brand" />
                      )}
                      <button
                        onClick={() => toggleVip(u)}
                        disabled={busy}
                        title={u.isVip ? "Remover VIP" : "Conceder VIP"}
                        aria-label={u.isVip ? "Remover VIP" : "Conceder VIP"}
                        className={cn(
                          "focus-duck rounded-md p-2 transition disabled:opacity-40",
                          u.isVip
                            ? "bg-brand/15 text-brand"
                            : "text-zinc-500 hover:bg-white/10 hover:text-brand",
                        )}
                      >
                        <Crown className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => toggleAdmin(u)}
                        disabled={busy || isSelf}
                        title={
                          isSelf
                            ? "Você não pode alterar o próprio papel"
                            : u.role === "admin"
                              ? "Remover admin"
                              : "Tornar admin"
                        }
                        aria-label="Alternar admin"
                        className={cn(
                          "focus-duck rounded-md p-2 transition disabled:opacity-30",
                          u.role === "admin"
                            ? "bg-sky-500/15 text-sky-300"
                            : "text-zinc-500 hover:bg-white/10 hover:text-sky-300",
                        )}
                      >
                        <Shield className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => toggleSuspend(u)}
                        disabled={busy || isSelf}
                        title={
                          isSelf
                            ? "Você não pode suspender a própria conta"
                            : u.status === "suspended"
                              ? "Reativar conta"
                              : "Suspender conta"
                        }
                        aria-label="Alternar suspensão"
                        className={cn(
                          "focus-duck rounded-md p-2 transition disabled:opacity-30",
                          u.status === "suspended"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "text-zinc-500 hover:bg-amber-500/10 hover:text-amber-400",
                        )}
                      >
                        {u.status === "suspended" ? (
                          <UserCheck className="h-4 w-4" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                      </button>

                      <button
                        onClick={() => removeUser(u)}
                        disabled={busy || isSelf}
                        aria-label="Excluir conta"
                        className={cn(
                          "focus-duck inline-flex items-center gap-1.5 rounded-md p-2 text-xs font-bold transition disabled:opacity-30",
                          confirmDeleteId === u.id
                            ? "bg-red-500/15 px-3 text-red-400"
                            : "text-zinc-500 hover:bg-red-500/10 hover:text-red-400",
                        )}
                      >
                        <Trash2 className="h-4 w-4" />
                        {confirmDeleteId === u.id && "Confirmar?"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-zinc-500">
            Nenhuma conta encontrada.
          </p>
        )}
      </div>

      <p className="text-xs text-zinc-600">
        👑 VIP libera o catálogo exclusivo · 🛡️ Admin recebe 2FA obrigatório ·
        Contas suspensas não conseguem entrar.
      </p>

      {/* Modal: criar conta */}
      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <button
            aria-label="Fechar"
            onClick={() => !saving && setModalOpen(false)}
            className="animate-fade-in fixed inset-0 cursor-default bg-black/75 backdrop-blur-sm"
          />
          <div className="animate-modal relative z-10 my-4 w-full max-w-lg overflow-hidden rounded-2xl bg-panel shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                <UserCog className="h-5 w-5 text-brand" />
                Nova conta
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
                className="focus-duck rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={createUser} className="space-y-4 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="u-name" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Nome *
                  </label>
                  <input
                    id="u-name"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="focus-duck w-full rounded-md border border-white/10 bg-panel-2 px-3 py-2.5 text-sm text-white"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="u-email" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    E-mail *
                  </label>
                  <input
                    id="u-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="focus-duck w-full rounded-md border border-white/10 bg-panel-2 px-3 py-2.5 text-sm text-white"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="u-pass" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Senha * (mín. 8)
                  </label>
                  <input
                    id="u-pass"
                    type="text"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Senha inicial da conta"
                    className="focus-duck w-full rounded-md border border-white/10 bg-panel-2 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="u-role" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Papel
                  </label>
                  <select
                    id="u-role"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="focus-duck w-full rounded-md border border-white/10 bg-panel-2 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="user">Usuário</option>
                    <option value="admin">Administrador (2FA)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="u-plan" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Plano
                  </label>
                  <select
                    id="u-plan"
                    value={form.plan}
                    onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                    className="focus-duck w-full rounded-md border border-white/10 bg-panel-2 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="free">Grátis</option>
                    <option value="vip">VIP 👑</option>
                  </select>
                </div>

                {form.plan === "vip" && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="u-days" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Duração do VIP (dias) — 0 = vitalício
                    </label>
                    <input
                      id="u-days"
                      type="number"
                      min={0}
                      value={form.vipDays}
                      onChange={(e) => setForm((f) => ({ ...f, vipDays: e.target.value }))}
                      className="focus-duck w-full rounded-md border border-white/10 bg-panel-2 px-3 py-2.5 text-sm text-white"
                    />
                  </div>
                )}
              </div>

              {form.role === "admin" && (
                <p className="rounded-md border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-xs leading-relaxed text-sky-200">
                  Um QR Code de verificação em 2 etapas será gerado e exibido{" "}
                  <strong>uma única vez</strong> após a criação.
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="focus-duck rounded-md px-4 py-2.5 text-sm font-semibold text-zinc-400 transition hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="focus-duck inline-flex items-center gap-2 rounded-md bg-brand px-6 py-2.5 text-sm font-extrabold text-black transition hover:bg-brand-300 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: QR do 2FA recém-gerado */}
      {createdSecret && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="animate-fade-in fixed inset-0 bg-black/85 backdrop-blur-sm" />
          <div className="animate-modal relative z-10 w-full max-w-sm rounded-2xl bg-panel p-6 text-center shadow-2xl ring-1 ring-white/10">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-brand" />
            <h3 className="text-lg font-bold text-white">
              2FA do novo administrador
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Mostre este QR Code para{" "}
              <span className="text-brand">{createdSecret.email}</span> escanear
              no Google Authenticator. Ele não será exibido novamente.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={createdSecret.qr}
              alt="QR Code do 2FA"
              className="mx-auto my-4 w-44 rounded-xl bg-white p-2"
            />
            <button
              onClick={() => {
                void navigator.clipboard.writeText(createdSecret.secret);
                toast.success("Chave copiada!");
              }}
              className="focus-duck mx-auto mb-4 flex max-w-full items-center gap-2 rounded-md border border-white/10 bg-panel-2 px-3 py-2 font-mono text-[11px] text-brand transition hover:border-brand/40"
            >
              <span className="break-all">{createdSecret.secret}</span>
              <Copy className="h-3.5 w-3.5 shrink-0" />
            </button>
            <button
              onClick={() => setCreatedSecret(null)}
              className="focus-duck w-full rounded-md bg-brand py-2.5 text-sm font-extrabold text-black transition hover:bg-brand-300"
            >
              Já anotei, fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
