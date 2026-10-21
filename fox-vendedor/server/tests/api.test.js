const fs = require("fs");
const path = require("path");

const rutaDb = path.join(__dirname, "..", "data", "api-test.db");
for (const sufijo of ["", "-wal", "-shm"]) fs.rmSync(rutaDb + sufijo, { force: true });
process.env.DB_PATH = rutaDb;
process.env.SYNC_KEY = "clave-de-prueba";
process.env.TOKEN_DIAS = "30";

const { app } = require("../src/server");
const { db, crearCodigo } = require("../src/db");

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

async function json(url, opciones = {}) {
  const respuesta = await fetch(url, opciones);
  const datos = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, datos };
}

(async () => {
  const servidor = app.listen(0);
  await new Promise((resolve) => servidor.once("listening", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const sync = { "X-Sync-Key": process.env.SYNC_KEY, "Content-Type": "application/json" };

  const salud = await json(`${base}/api/salud`);
  assert(salud.status === 200 && salud.datos.ok, "La API no responde salud.");

  const syncInvalida = await json(`${base}/api/sync/catalogo`, {
    method: "POST",
    headers: { "X-Sync-Key": "incorrecta", "Content-Type": "application/json" },
    body: JSON.stringify({ articulos: [] }),
  });
  assert(syncInvalida.status === 401, "Aceptó una clave de sincronización incorrecta.");

  const articulos = [
    { idart: 1, codigo: "A001", codbarra: "7790000000011", descripcion: "Yerba mate 1 kg", detalle: "", unidad: "UN", stock: 10, iva: 21, pfinal1: 1210, pfinal2: 1100, pfinal3: 0, pfinal4: 0, idrubro: 1, idmarca: 1, actualizado_fox: "20/10/2026" },
    { idart: 2, codigo: "A002", codbarra: "", descripcion: "Azúcar 1 kg", detalle: "", unidad: "UN", stock: 5, iva: 0, pfinal1: 1800, pfinal2: 1700, pfinal3: 0, pfinal4: 0, idrubro: 1, idmarca: 0, actualizado_fox: "20/10/2026" },
  ];
  const catalogo = await json(`${base}/api/sync/catalogo`, {
    method: "POST",
    headers: sync,
    body: JSON.stringify({ articulos, reemplazar: true }),
  });
  assert(catalogo.status === 200 && catalogo.datos.articulos === 2, "No se sincronizó el catálogo.");

  const codigo = crearCodigo("Vendedor de prueba", 1).codigo;
  const acceso = await json(`${base}/api/acceso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  assert(acceso.status === 200 && acceso.datos.token, "No se pudo canjear el código.");
  const repetido = await json(`${base}/api/acceso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  assert(repetido.status === 401, "El código se pudo usar dos veces.");
  const auth = { Authorization: `Bearer ${acceso.datos.token}`, "Content-Type": "application/json" };

  const buscar = await json(`${base}/api/articulos?q=yerba&lista=2`, { headers: auth });
  assert(buscar.status === 200 && buscar.datos.articulos.length === 1, "La búsqueda no encontró el artículo.");
  assert(buscar.datos.articulos[0].precio === 1100, "No respetó la lista de precios 2.");

  const crear = await json(`${base}/api/presupuestos`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ lista: 1, cliente: "Autoservicio Norte", items: [{ idart: 1, cantidad: 2 }, { idart: 2, cantidad: 1 }] }),
  });
  assert(crear.status === 201 && crear.datos.presupuesto.id, "No se creó el presupuesto.");
  assert(crear.datos.presupuesto.total === 4220, `Total inesperado: ${crear.datos.presupuesto.total}`);
  const idPresupuesto = crear.datos.presupuesto.id;

  const pendientes = await json(`${base}/api/sync/pendientes`, { headers: sync });
  assert(pendientes.status === 200 && pendientes.datos.presupuestos.length === 1, "No apareció el presupuesto pendiente.");
  assert(pendientes.datos.presupuestos[0].items.length === 2, "El pendiente no trae los ítems.");

  const confirmar = await json(`${base}/api/sync/presupuestos/${idPresupuesto}/confirmado`, {
    method: "POST",
    headers: sync,
    body: JSON.stringify({ idcompro: 99, numero: 7 }),
  });
  assert(confirmar.status === 200, "No se pudo confirmar la sincronización.");

  const historial = await json(`${base}/api/presupuestos`, { headers: auth });
  assert(historial.datos.presupuestos[0].estado === "SINCRONIZADO", "El presupuesto no quedó sincronizado.");
  assert(historial.datos.presupuestos[0].fox_numero === 7, "No se guardó el número de Fox.");

  const sinToken = await json(`${base}/api/articulos?q=yerba`);
  assert(sinToken.status === 401, "Permitió consultar sin token.");

  servidor.close();
  db.close();
  console.log("OK API Fox Vendedor: código de un solo uso, token, catálogo, búsqueda, presupuesto y sincronización.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
