/*
 * Limpieza automática de PDFs generados en disco.
 *
 * Los PDFs (facturas, documentos comerciales y devoluciones de pedidos) se
 * guardan en storage/pdf/<empresa>/... y quedan disponibles para volver a
 * imprimirlos. Para que el disco no crezca sin control, este servicio borra
 * los archivos con más de PDF_RETENCION_DIAS días (30 por defecto) y limpia
 * las referencias en la base. Si el usuario vuelve a pedir el PDF, el ERP lo
 * regenera en el momento.
 *
 * Se ejecuta al arrancar el servidor y luego una vez por día.
 */
const fs = require("fs");
const path = require("path");
const db = require("../db/database");

const RETENCION_DIAS = Math.max(1, Number(process.env.PDF_RETENCION_DIAS || 30));
const INTERVALO_MS = 24 * 60 * 60 * 1000;

const TABLAS = [
  { tabla: "facturas", url: "pdf_url" },
  { tabla: "documentos_comerciales", url: "pdf_url" },
  { tabla: "devoluciones_pedido", url: "pdf_url" },
];

function raizPdfs() {
  return path.join(process.cwd(), "storage", "pdf");
}

function listarArchivos(dir, acumulado) {
  let entradas = [];
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return acumulado;
  }
  for (const entrada of entradas) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) listarArchivos(completo, acumulado);
    else acumulado.push(completo);
  }
  return acumulado;
}

function borrarArchivosViejos() {
  const raiz = raizPdfs();
  if (!fs.existsSync(raiz)) return { borrados: 0 };
  const limite = Date.now() - RETENCION_DIAS * 24 * 60 * 60 * 1000;
  let borrados = 0;
  for (const archivo of listarArchivos(raiz, [])) {
    if (!/\.pdf$/i.test(archivo)) continue;
    try {
      const info = fs.statSync(archivo);
      if (info.mtimeMs < limite) {
        fs.unlinkSync(archivo);
        borrados += 1;
      }
    } catch (error) {
      /* archivo tomado por otro proceso: se reintenta en la próxima pasada */
    }
  }
  return { borrados };
}

function rutaExistente(rutaGuardada) {
  if (!rutaGuardada) return true;
  const absoluta = path.isAbsolute(rutaGuardada)
    ? rutaGuardada
    : path.join(process.cwd(), rutaGuardada);
  return fs.existsSync(absoluta);
}

function limpiarReferencias() {
  let limpiadas = 0;
  for (const { tabla, url } of TABLAS) {
    let filas = [];
    try {
      filas = db
        .prepare(`SELECT id, pdf_path FROM ${tabla} WHERE pdf_path IS NOT NULL AND pdf_path <> ''`)
        .all();
    } catch (error) {
      continue;
    }
    const update = db.prepare(
      `UPDATE ${tabla} SET pdf_path = NULL, ${url} = NULL WHERE id = ?`,
    );
    for (const fila of filas) {
      if (!rutaExistente(fila.pdf_path)) {
        update.run(fila.id);
        limpiadas += 1;
      }
    }
  }
  return { limpiadas };
}

function limpiarPdfsAntiguos() {
  try {
    const { borrados } = borrarArchivosViejos();
    const { limpiadas } = limpiarReferencias();
    if (borrados || limpiadas) {
      console.log(
        `[pdf-retencion] PDFs borrados: ${borrados}, referencias limpiadas: ${limpiadas} (retención ${RETENCION_DIAS} días).`,
      );
    }
    return { ok: true, borrados, limpiadas };
  } catch (error) {
    console.error("[pdf-retencion] Error al limpiar PDFs:", error.message);
    return { ok: false, error: error.message };
  }
}

function iniciarLimpiezaPdfs() {
  limpiarPdfsAntiguos();
  const timer = setInterval(limpiarPdfsAntiguos, INTERVALO_MS);
  if (timer.unref) timer.unref();
}

module.exports = { limpiarPdfsAntiguos, iniciarLimpiezaPdfs };
