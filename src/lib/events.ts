/**
 * Barramento de eventos em memória usado para atualizações em tempo real.
 * As rotas de API publicam eventos aqui e o endpoint SSE (/api/events)
 * repassa para todos os navegadores conectados.
 */
import { EventEmitter } from "node:events";

export type LiveEvent =
  | { type: "videos"; action: "created" | "updated" | "deleted"; id?: number }
  | { type: "users"; action: "created" | "updated" | "deleted"; id?: number };

const globalForEvents = globalThis as typeof globalThis & {
  __duckeFlixBus?: EventEmitter;
};

export const bus =
  globalForEvents.__duckeFlixBus ??
  (() => {
    const e = new EventEmitter();
    e.setMaxListeners(0); // sem limite de abas conectadas
    return e;
  })();

globalForEvents.__duckeFlixBus = bus;

export function publish(event: LiveEvent): void {
  bus.emit("live", event);
}

export function subscribe(listener: (event: LiveEvent) => void): () => void {
  bus.on("live", listener);
  return () => {
    bus.off("live", listener);
  };
}
