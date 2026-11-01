import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("Geral"),
  videoUrl: text("video_url").notNull(),
  thumbUrl: text("thumb_url"),
  year: integer("year"),
  durationSec: integer("duration_sec"),
  rating: text("rating").notNull().default("L"),
  source: text("source").notNull().default("url"),
  featured: boolean("featured").notNull().default(false),
  /** conteúdo exclusivo para assinantes VIP */
  vipOnly: boolean("vip_only").notNull().default(false),
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

/**
 * Contas da plataforma.
 * role:   "user" | "admin"      — admin acessa o painel /DuckeScripts
 * plan:   "free" | "vip"        — VIP libera o catálogo exclusivo
 * status: "active" | "suspended"
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** segredo TOTP — obrigatório para contas admin (2FA) */
  totpSecret: text("totp_secret"),
  role: text("role").notNull().default("user"),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  /** vencimento do VIP; null = vitalício enquanto plan = "vip" */
  vipUntil: timestamp("vip_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/** Dados públicos de uma conta (nunca expõe hash/segredo) */
export type SafeUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  plan: string;
  status: string;
  vipUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  isVip: boolean;
  has2fa: boolean;
};

/** @deprecated mantida apenas para migração dos dados antigos */
export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
