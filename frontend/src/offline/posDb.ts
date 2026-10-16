/*
 * Base local del POS para el modo sin conexión (IndexedDB).
 *
 * Guarda:
 *  - snapshot : la última copia buena de catálogo, clientes, config y
 *               puntos de venta, para poder vender sin internet.
 *  - outbox   : la cola de ventas hechas sin conexión, esperando enviarse.
 *  - borrador : el borrador del POS (pestañas abiertas) para no perderlo
 *               cuando falla el guardado contra el servidor.
 *  - cache    : copia de los valores de /erp/state/:key (promociones,
 *               descuentos, catálogos) para que sigan aplicándose offline.
 *  - meta     : datos del equipo (identificador de dispositivo, etc.).
 *
 * No se usa localStorage para datos comerciales.
 */

const DB_NAME = "erp-pos-offline";
const DB_VERSION = 1;
const STORES = ["snapshot", "outbox", "borrador", "cache", "meta"] as const;

export type StorePos = (typeof STORES)[number];

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("snapshot")) db.createObjectStore("snapshot", { keyPath: "id" });
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "uuid" });
      if (!db.objectStoreNames.contains("borrador")) db.createObjectStore("borrador", { keyPath: "id" });
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function conStore<T>(
  store: StorePos,
  mode: IDBTransactionMode,
  fn: (os: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await abrir();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export function guardarPos(store: StorePos, valor: any) {
  return conStore<IDBValidKey>(store, "readwrite", (os) => os.put(valor));
}

export function obtenerPos<T = any>(store: StorePos, id: any) {
  return conStore<T | undefined>(store, "readonly", (os) => os.get(id));
}

export function listarPos<T = any>(store: StorePos) {
  return conStore<T[]>(store, "readonly", (os) => os.getAll());
}

export function eliminarPos(store: StorePos, id: any) {
  return conStore<undefined>(store, "readwrite", (os) => os.delete(id));
}

/* ------------------------- snapshot del POS ------------------------- */

/*
 * El snapshot se guarda tal como llega el Promise.all() de la carga del POS
 * (mismo orden de posiciones), así el modo offline lo reusa sin conversión.
 */
export function guardarSnapshotPos(datos: any[]) {
  return guardarPos("snapshot", { id: "pos", guardado: new Date().toISOString(), datos });
}

export async function leerSnapshotPos(): Promise<any[] | null> {
  const row: any = await obtenerPos("snapshot", "pos");
  return Array.isArray(row?.datos) ? row.datos : null;
}

/* --------------------------- borrador POS --------------------------- */

export function guardarBorradorLocal(draft: any) {
  return guardarPos("borrador", { id: "pos", guardado: new Date().toISOString(), draft });
}

export async function leerBorradorLocal(): Promise<any | null> {
  const row: any = await obtenerPos("borrador", "pos");
  return row?.draft || null;
}

/* ------------------- caché de valores /erp/state -------------------- */

export function guardarCacheEstado(key: string, value: any) {
  return guardarPos("cache", { key, value, guardado: new Date().toISOString() });
}

export async function leerCacheEstado<T = any>(key: string): Promise<T | null> {
  const row: any = await obtenerPos("cache", key);
  return row ? (row.value as T) : null;
}

/* ------------------------- cola de operaciones ---------------------- */

export type OperacionCola = {
  uuid: string;
  tipo: string;
  creado_en: string;
  payload: any;
  estado: "pendiente" | "rechazada";
  error?: string | null;
  intentos: number;
  proximoIntento: number;
};

export function encolarOperacion(op: {
  uuid: string;
  tipo: string;
  creado_en: string;
  payload: any;
}) {
  const fila: OperacionCola = {
    ...op,
    estado: "pendiente",
    error: null,
    intentos: 0,
    proximoIntento: 0,
  };
  return guardarPos("outbox", fila);
}

export function listarColaPos(): Promise<OperacionCola[]> {
  return listarPos<OperacionCola>("outbox");
}

export function actualizarOperacionPos(uuid: string, patch: Partial<OperacionCola>) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const actual = await obtenerPos<OperacionCola>("outbox", uuid);
      if (!actual) return resolve();
      await guardarPos("outbox", { ...actual, ...patch });
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

export function quitarOperacionPos(uuid: string) {
  return eliminarPos("outbox", uuid);
}

export async function contarColaPos(): Promise<{ pendientes: number; rechazadas: number }> {
  const cola = await listarColaPos();
  return {
    pendientes: cola.filter((x) => x.estado !== "rechazada").length,
    rechazadas: cola.filter((x) => x.estado === "rechazada").length,
  };
}

/* ----------------------------- dispositivo -------------------------- */

export async function deviceIdPos(): Promise<string> {
  const row: any = await obtenerPos("meta", "device");
  if (row?.deviceId) return row.deviceId;
  const id = uuidOffline();
  await guardarPos("meta", { id: "device", deviceId: id, creado: new Date().toISOString() });
  return id;
}

/* ------------------------------ utilidades -------------------------- */

export function uuidOffline(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* Fecha y hora local en formato "YYYY-MM-DD HH:MM:SS" (igual al servidor). */
export function fechaLocalAhora(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}
