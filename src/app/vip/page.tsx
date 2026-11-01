import type { Metadata } from "next";
import Link from "next/link";
import { Check, Crown } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = { title: "DuckeFlix VIP" };

const BENEFITS = [
  "Acesso total ao catálogo exclusivo VIP",
  "Lançamentos antes de todo mundo",
  "Reprodução sem interrupções, em alta definição",
  "Selo VIP dourado no seu perfil",
];

export default function VipPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-3xl px-6 pb-24 pt-32 text-center">
        <span className="inline-flex rounded-3xl border border-brand/25 bg-brand/10 p-5">
          <Crown className="h-12 w-12 text-brand" />
        </span>
        <h1 className="font-display mt-6 text-4xl uppercase tracking-wide sm:text-6xl">
          DuckeFlix <span className="text-brand">VIP</span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-zinc-400 sm:text-base">
          Libere o catálogo exclusivo e assista sem limites aos títulos
          reservados para assinantes.
        </p>

        <ul className="mx-auto mt-10 grid max-w-md gap-3 text-left">
          {BENEFITS.map((b) => (
            <li
              key={b}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-panel px-4 py-3 text-sm text-zinc-200"
            >
              <Check className="h-4 w-4 shrink-0 text-brand" />
              {b}
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-2xl border border-brand/25 bg-brand/5 p-6">
          <p className="text-sm leading-relaxed text-zinc-300">
            O plano VIP é liberado pela equipe do DuckeFlix. Fale com o
            administrador para ativar o seu — assim que ativado, seu acesso
            muda <strong className="text-brand">na hora</strong>, sem precisar
            recarregar a página.
          </p>
          <Link
            href="/"
            className="focus-duck mt-5 inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-extrabold text-black transition hover:bg-brand-300"
          >
            Explorar catálogo
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
