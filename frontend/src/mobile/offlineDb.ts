/*
 * Base local de la app móvil (IndexedDB).
 *
 * Guarda el catálogo y la cartera para trabajar sin señal, y la cola de
 * pedidos/visitas creados offline hasta que se puedan sincronizar.
 * No se usa localStorage para datos comerciales.
 */

const DB_NAME = "erp-movil";
const DB_VERSION = 1;
const STORES = ["clientes", "productos", "pedidos", "visitas", "meta"] as const;

export type StoreMovil = (typeof STORES)[number];

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function conStore<T>(
  store: StoreMovil,
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

export function guardar(store: StoreMovil, valor: any) {
  return conStore<IDBValidKey>(store, "readwrite", (os) => os.put(valor));
}

export function guardarMuchos(store: StoreMovil, valores: any[]) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const db = await abrir();
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      for (const valor of valores) os.put(valor);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    } catch (error) {
      reject(error);
    }
  });
}

export function listar<T = any>(store: StoreMovil) {
  return conStore<T[]>(store, "readonly", (os) => os.getAll());
}

export function obtener<T = any>(store: StoreMovil, id: any) {
  return conStore<T | undefined>(store, "readonly", (os) => os.get(id));
}

export function eliminar(store: StoreMovil, id: any) {
  return conStore<undefined>(store, "readwrite", (os) => os.delete(id));
}

export function limpiar(store: StoreMovil) {
  return conStore<undefined>(store, "readwrite", (os) => os.clear());
}

/*
 * UUID para identificar cada pedido/visita creado en el celular y que el
 * servidor no lo duplique al sincronizar.
 */
export function uuidMovil(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
