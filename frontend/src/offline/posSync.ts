/*
 * Motor de sincronización del POS sin conexión.
 *
 * Envía la cola local en lotes chicos, con espera creciente entre
 * reintentos (nunca martilla el servidor) y timeout por pedido. Los
 * rechazos definitivos quedan marcados para que el cajero los revise;
 * las fallas transitorias (sin red, sesión vencida, servidor caído) se
 * reintentan solas más tarde.
 */

import { erpApi } from "../services/api";
import {
  actualizarOperacionPos,
  contarColaPos,
  deviceIdPos,
  guardarSnapshotPos,
  leerBorradorLocal,
  leerSnapshotPos,
  listarColaPos,
  quitarOperacionPos,
} from "./posDb";

export { contarColaPos } from "./posDb";
export type { OperacionCola } from "./posDb";

const LOTE = 20;
const TIMEOUT_MS = 45000;
/* Esperas entre reintentos según la cantidad de intentos fallidos. */
const BACKOFF = [0, 5000, 15000, 60000, 300000];

type ResultadoSync = { aplicadas: number; rechazadas: number; duplicadas: number; detalles: string[] };

let enCurso: Promise<ResultadoSync> | null = null;

export function esErrorDeRed(error: any): boolean {
  if (!error) return false;
  if (typeof error.status === "number") return false;
  const mensaje = String(error?.message || error);
  if (error.name === "AbortError" || /abort/i.test(mensaje)) return true;
  return error instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(mensaje);
}

function avisarCola() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("afip:pos-cola"));
}

function avisarOffline() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("afip:pos-offline"));
}

/*
 * Carga los datos del POS (catálogo, clientes, config). Si no hay
 * conexión y existe un snapshot local, devuelve esa copia para poder
 * seguir trabajando; el borrador local (si hay uno más nuevo) pisa al
 * del servidor.
 */
export async function cargarDatosPos(calls: Promise<any>[]): Promise<any[]> {
  try {
    const datos = await Promise.all(calls);
    guardarSnapshotPos(datos).catch(() => {});
    return datos;
  } catch (error: any) {
    if (esErrorDeRed(error)) {
      const snap = await leerSnapshotPos();
      if (snap) {
        const borrador = await leerBorradorLocal();
        if (borrador) snap[4] = { draft: borrador };
        avisarOffline();
        return snap;
      }
    }
    throw error;
  }
}

export function sincronizarColaPos(): Promise<ResultadoSync> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      const ahora = Date.now();
      const cola = (await listarColaPos()).filter(
        (o) => o.estado !== "rechazada" && Number(o.proximoIntento || 0) <= ahora,
      );
      if (!cola.length) return { aplicadas: 0, rechazadas: 0, duplicadas: 0, detalles: [] };

      const dispositivo = await deviceIdPos();
      let aplicadas = 0;
      let rechazadas = 0;
      let duplicadas = 0;
      const detalles: string[] = [];

      for (let i = 0; i < cola.length; i += LOTE) {
        const lote = cola.slice(i, i + LOTE);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
          let r: any;
          try {
            r = await erpApi.sincronizarCola(
              {
                dispositivo,
                operaciones: lote.map((o) => ({
                  uuid: o.uuid,
                  tipo: o.tipo,
                  creado_en: o.creado_en,
                  payload: o.payload,
                })),
              },
              controller.signal,
            );
          } finally {
            clearTimeout(timer);
          }

          for (const res of r?.resultados || []) {
            if (res.ok) {
              if (res.duplicada) duplicadas++;
              else aplicadas++;
              await quitarOperacionPos(res.uuid);
              const op = res.operation || {};
              if (op.number) {
                detalles.push(
                  `${op.type || "VENTA"} ${String(op.pointOfSale || "").padStart(4, "0")}-${String(op.number).padStart(8, "0")}`,
                );
              }
            } else {
              rechazadas++;
              await actualizarOperacionPos(res.uuid, {
                estado: "rechazada",
                error: String(res.error || "Rechazada"),
              });
              detalles.push(`Rechazada: ${res.error || "sin detalle"}`);
            }
          }
        } catch (error: any) {
          /*
           * Falla transitoria completa (sin red, 401, 429, 500): no se
           * marca rechazada; cada venta se reintenta con espera creciente.
           */
          for (const o of lote) {
            const intentos = Number(o.intentos || 0) + 1;
            await actualizarOperacionPos(o.uuid, {
              intentos,
              proximoIntento: Date.now() + BACKOFF[Math.min(intentos, BACKOFF.length - 1)],
            });
          }
          throw error;
        }
      }

      avisarCola();
      return { aplicadas, rechazadas, duplicadas, detalles };
    } finally {
      enCurso = null;
      avisarCola();
    }
  })();
  return enCurso;
}

/* Descarta de la cola una venta rechazada (el cajero la revisó). */
export async function descartarOperacionPos(uuid: string) {
  await quitarOperacionPos(uuid);
  avisarCola();
}
