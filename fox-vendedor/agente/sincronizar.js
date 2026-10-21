const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { mapearArticulo, mapearPresupuestoAFox } = require("./mapeo");

const args = process.argv.slice(2);
const tiene = (nombre) => args.includes(`--${nombre}`);
const valor = (nombre) => {
  const indice = args.indexOf(`--${nombre}`);
  return indice >= 0 && args[indice + 1] && !args[indice + 1].startsWith("--") ? args[indice + 1] : "";
};

function leerConfig() {
  const carpetaBase = process.pkg ? path.dirname(process.execPath) : __dirname;
  const archivo = path.join(carpetaBase, "config.json");
  if (!fs.existsSync(archivo)) {
    console.error("Falta config.json al lado del programa. Copiá config.example.json y completá los datos.");
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(archivo, "utf8"));
  if (!config.app?.url || !config.app?.sync_key) throw new Error("Faltan app.url o app.sync_key en config.json.");
  if (!config.fox?.host || !config.fox?.user || !config.fox?.database) throw new Error("Faltan datos de conexión a Fox/MariaDB en config.json.");
  return config;
}

function urlApp(config, ruta) {
  return String(config.app.url).replace(/\/+$/, "") + ruta;
}

async function apiSync(config, ruta, opciones = {}) {
  const respuesta = await fetch(urlApp(config, ruta), {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      "X-Sync-Key": config.app.sync_key,
      ...(opciones.headers || {}),
    },
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || `Error HTTP ${respuesta.status}`);
  return datos;
}

async function crearCodigo(config, nombre) {
  const datos = await apiSync(config, "/api/sync/codigo", {
    method: "POST",
    body: JSON.stringify({ nombre: nombre || "Vendedor", dias: 1 }),
  });
  console.log("");
  console.log("Código de acceso de un solo uso");
  console.log("--------------------------------");
  console.log(`Vendedor: ${nombre || "Vendedor"}`);
  console.log(`Código:   ${datos.codigo}`);
  console.log(`Vence:    ${new Date(datos.expiraEn).toLocaleString("es-AR")}`);
  console.log("");
}

async function sincronizarCatalogo(config, conexion) {
  console.log("Leyendo artículos de Fox/MariaDB...");
  const [filas] = await conexion.query(`
    SELECT idart, codprove, codfabri, descrip, detalle, unidad, stock, iva,
           pfinal1, pfinal2, pfinal3, pfinal4, idrubro, idmarca, codbarra, fultact
    FROM articulos
    WHERE venta = 1
    ORDER BY idart
  `);
  const articulos = filas.map(mapearArticulo).filter((a) => a.idart > 0 && a.descripcion);
  console.log(`Artículos para enviar: ${articulos.length}`);

  const tamano = 1500;
  for (let i = 0; i < articulos.length; i += tamano) {
    const parte = articulos.slice(i, i + tamano);
    const datos = await apiSync(config, "/api/sync/catalogo", {
      method: "POST",
      body: JSON.stringify({ articulos: parte, reemplazar: i === 0 }),
    });
    console.log(`  Catálogo: ${datos.articulos} artículos (bloque ${Math.floor(i / tamano) + 1})`);
  }
  if (!articulos.length) {
    await apiSync(config, "/api/sync/catalogo", {
      method: "POST",
      body: JSON.stringify({ articulos: [], reemplazar: true }),
    });
  }
  console.log("Catálogo sincronizado.");
}

async function siguienteNumero(conexion, compro, pv) {
  const [filas] = await conexion.query(
    "SELECT numero FROM compro WHERE compro=? AND pv=? ORDER BY numero DESC LIMIT 1",
    [compro, pv],
  );
  return filas.length ? Number(filas[0].numero) + 1 : 1;
}

async function insertarPresupuesto(conexion, presupuesto, config) {
  const { compro, items } = mapearPresupuestoAFox(presupuesto, config.presupuesto || {});
  const numero = await siguienteNumero(conexion, compro.compro, compro.pv);
  const idcomprosucu = `${compro.pv}-${numero}`;

  await conexion.beginTransaction();
  try {
    const [resultado] = await conexion.query(
      `INSERT INTO compro
       (compro,letra,pv,numero,importe,det,varios,fecha,fvenci,apnom,dir,cuit,tipo,estado,tipodoc,escf,
        tipoiva,neto,subtotal,iva21,iva105,iva27,iva5,iva25,total,sub21,sub105,sub27,nogravado,exento,
        idvendedor,idmoneda,moneda,idcomprosucu)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        compro.compro, compro.letra, compro.pv, numero, compro.importe, compro.det, compro.varios,
        compro.fecha, compro.fvenci, compro.apnom, compro.dir, compro.cuit, compro.tipo, compro.estado,
        compro.tipodoc, compro.escf, compro.tipoiva, compro.neto, compro.subtotal, compro.iva21,
        compro.iva105, compro.iva27, compro.iva5, compro.iva25, compro.total, compro.sub21, compro.sub105,
        compro.sub27, compro.nogravado, compro.exento, compro.idvendedor, compro.idmoneda, compro.moneda,
        idcomprosucu,
      ],
    );
    const idcompro = Number(resultado.insertId);

    const insertarItemSql = `INSERT INTO detcompro
      (codigo,descripcion,cant,puni,descu,iva,ptotal,idcompro,iva21,iva105,iva27,neto,subtotal,idrubro,
       idart,idunidmed,subtotal21,subtotal105,subtotal27,reserva,totalreti,nogravado,impboni,esgana,gana,
       pcosto,unidadmed,pas,idcomprosucu,pasweb,idiva)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    for (const item of items) {
      await conexion.execute(insertarItemSql, [
        item.codigo, item.descripcion, item.cant, item.puni, item.descu, item.iva, item.ptotal, idcompro,
        item.iva21, item.iva105, item.iva27, item.neto, item.subtotal, item.idrubro, item.idart, 0,
        item.subtotal21, item.subtotal105, item.subtotal27, 0, 0, item.nogravado, 0, 0, 0, 0,
        item.unidadmed, 0, idcomprosucu, 1, 1,
      ]);
    }
    await conexion.commit();
    return { idcompro, numero };
  } catch (error) {
    await conexion.rollback();
    throw error;
  }
}

async function sincronizarPresupuestos(config, conexion) {
  const datos = await apiSync(config, "/api/sync/pendientes");
  const pendientes = datos.presupuestos || [];
  console.log(`Presupuestos pendientes: ${pendientes.length}`);

  for (const presupuesto of pendientes) {
    try {
      const { idcompro, numero } = await insertarPresupuesto(conexion, presupuesto, config);
      let confirmado = false;
      for (let intento = 0; intento < 3 && !confirmado; intento++) {
        try {
          await apiSync(config, `/api/sync/presupuestos/${presupuesto.id}/confirmado`, {
            method: "POST",
            body: JSON.stringify({ idcompro, numero }),
          });
          confirmado = true;
        } catch (error) {
          if (intento === 2) throw error;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      console.log(`  Presupuesto web #${presupuesto.id} -> Fox compro ${idcompro}, número ${numero}`);
    } catch (error) {
      console.error(`  Error con presupuesto web #${presupuesto.id}: ${error.message}`);
      try {
        await apiSync(config, `/api/sync/presupuestos/${presupuesto.id}/error`, {
          method: "POST",
          body: JSON.stringify({ error: error.message }),
        });
      } catch {}
    }
  }
}

async function main() {
  const config = leerConfig();

  if (tiene("codigo")) {
    await crearCodigo(config, valor("codigo"));
    return;
  }

  const conexion = await mysql.createConnection({
    host: config.fox.host,
    port: Number(config.fox.port || 3306),
    user: config.fox.user,
    password: config.fox.password,
    database: config.fox.database,
    decimalNumbers: true,
    charset: "latin1",
  });

  try {
    if (!tiene("solo-presupuestos")) await sincronizarCatalogo(config, conexion);
    if (!tiene("solo-catalogo")) await sincronizarPresupuestos(config, conexion);
    console.log("Sincronización terminada.");
  } finally {
    await conexion.end();
  }
}

main().catch((error) => {
  console.error("Error de sincronización:", error.message);
  process.exit(1);
});
