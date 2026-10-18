const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/caja-turnos-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

/* AFIP simulado: la factura mueve caja y no necesita certificados en la prueba. */
const fiscalPath = require.resolve("../src/afip/fiscalEmission.service");
class FiscalNetworkError extends Error {}
let numeroFactura = 600000;
require.cache[fiscalPath] = {
  id: fiscalPath,
  filename: fiscalPath,
  loaded: true,
  exports: {
    FiscalNetworkError,
    emitirComprobanteAfip: async ({ items = [] }) => {
      const neto = items.reduce((n, x) => n + Number(x.precio_unitario || 0) * Number(x.cantidad || 0), 0);
      const importeNeto = Math.round(neto * 100) / 100;
      numeroFactura++;
      return {
        ok: true,
        numero: numeroFactura,
        cae: "70123456789012",
        vencimiento: "2026-11-25",
        tipoComprobante: 6,
        letra: "B",
        nombreComprobante: "FACTURA B",
        resultado: "A",
        importeNeto,
        importeIva: 0,
        importeTotal: importeNeto,
      };
    },
  },
};

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const erp = require("../src/controllers/erpConsolidation.controller");
const beta2 = require("../src/controllers/beta2.controller");

const empresa = db.prepare("SELECT * FROM empresas WHERE nombre='empresa1'").get();
const producto = db.prepare("SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const branch = db.prepare("SELECT id FROM sucursales WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const cajero1 = db.prepare("SELECT * FROM cajeros WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
if (!empresa || !producto || !branch || !cajero1) throw new Error("El seed demo no tiene datos suficientes.");
const pv = db.prepare("SELECT numero FROM puntos_venta WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id)?.numero || 1;

function crearCajero(codigo, nombre) {
  const info = db
    .prepare("INSERT INTO cajeros(empresa_id,codigo,nombre,activo) VALUES(?,?,?,1)")
    .run(empresa.id, codigo, nombre);
  return Number(info.lastInsertRowid);
}
const cajero2 = crearCajero("CAJA2", "Cajero Dos");
const cajero3 = crearCajero("CAJA3", "Cajero Tres");

let idAuto = 1000;
function conRespuesta(fn, body = {}, params = {}, query = {}) {
  let status = 200;
  let payload = null;
  const req = {
    empresa: { id: empresa.id },
    user: { id: 1, empresaId: empresa.id },
    usuario: { id: 1, empresaId: empresa.id },
    body,
    params,
    query,
  };
  const res = {
    status(v) {
      status = v;
      return this;
    },
    json(v) {
      payload = v;
      return v;
    },
  };
  return Promise.resolve(fn(req, res, () => {})).then(() => ({ status, payload }));
}

async function vender(cajeroId, total) {
  idAuto++;
  const r = await conRespuesta(erp.createPosOperation, {
    mode: "NORMAL",
    document_kind: "FACTURA_ELECTRONICA",
    cliente_nombre: "CONSUMIDOR FINAL",
    sucursal_id: branch.id,
    cajero_id: cajeroId,
    punto_venta: pv,
    condicion_pago: "CONTADO",
    subtotal: total,
    total,
    pagos: { EFECTIVO: total },
    items: [
      {
        producto_id: producto.id,
        codigo: producto.codigo,
        descripcion: producto.descripcion,
        unidad: "UN",
        cantidad: 1,
        precio_unitario: total,
        iva: 21,
        costo: 0,
      },
    ],
  });
  if (r.status !== 201 || !r.payload?.ok) throw new Error(`No se pudo vender: ${JSON.stringify(r.payload)}`);
  return r.payload.operation;
}

const sesion = (id) => db.prepare("SELECT * FROM caja_sesiones WHERE id=?").get(id);

(async () => {
  /* 1) La primera venta abre sola la sesión del cajero (fondo 0). */
  const venta1 = await vender(cajero1.id, 1000);
  const s1 = sesion(db.prepare("SELECT caja_sesion_id FROM ventas_pos WHERE id=?").get(venta1.saleId).caja_sesion_id);
  if (!s1 || s1.estado !== "ABIERTA" || Number(s1.cajero_id) !== Number(cajero1.id)) throw new Error("La venta no abrió la caja del cajero.");
  if (Number(s1.saldo_teorico) !== 1000) throw new Error(`Saldo teórico inesperado: ${s1.saldo_teorico}`);

  /* 2) Cambio de turno: cierra con arqueo y abre la caja del que recibe. */
  const cambio = await conRespuesta(erp.cambioTurno, {
    cajero_id: cajero2,
    fondo_inicial: 500,
    importe_contado: 1100,
    arqueo: { efectivo_contado: 1100, efectivo_teorico: 1000, otros_medios: 0, saldo_teorico: 1000 },
    observaciones: "relevo 14:00",
  }, { id: String(s1.id) });
  if (cambio.status !== 200 || !cambio.payload?.ok) throw new Error(`El cambio de turno falló: ${JSON.stringify(cambio.payload)}`);
  const cerrada = sesion(s1.id);
  if (cerrada.estado !== "CERRADA") throw new Error("La caja saliente no quedó cerrada.");
  if (Number(cerrada.importe_contado) !== 1100 || Number(cerrada.diferencia) !== 100) {
    throw new Error(`Arqueo incorrecto: contado ${cerrada.importe_contado}, diferencia ${cerrada.diferencia}`);
  }
  if (cerrada.observaciones_cierre !== "relevo 14:00") throw new Error("No se guardaron las observaciones del cierre.");
  const nueva = sesion(cambio.payload.abierta);
  if (!nueva || nueva.estado !== "ABIERTA" || Number(nueva.cajero_id) !== cajero2) throw new Error("No se abrió la caja del cajero entrante.");
  if (Number(nueva.importe_apertura) !== 500 || Number(nueva.saldo_teorico) !== 500) throw new Error("El fondo inicial del nuevo turno no quedó registrado.");
  if (Number(nueva.punto_venta) !== Number(s1.punto_venta) || Number(nueva.sucursal_id) !== Number(s1.sucursal_id)) {
    throw new Error("El nuevo turno debe continuar en la misma sucursal y punto de venta.");
  }
  const apertura = db.prepare("SELECT COUNT(*) n FROM caja_movimientos WHERE caja_sesion_id=? AND tipo='APERTURA'").get(nueva.id).n;
  if (apertura !== 1) throw new Error("No se registró el movimiento de fondo inicial.");

  /* 3) Las ventas siguientes se imputan a la caja del cajero entrante. */
  const venta2 = await vender(cajero2, 2000);
  const sesionVenta2 = db.prepare("SELECT caja_sesion_id FROM ventas_pos WHERE id=?").get(venta2.saleId).caja_sesion_id;
  if (Number(sesionVenta2) !== nueva.id) throw new Error("La venta del cajero entrante no cayó en su turno.");
  if (Number(sesion(nueva.id).saldo_teorico) !== 2500) throw new Error("El saldo del nuevo turno no acumuló la venta.");

  /* 4) Validaciones: caja cerrada, mismo cajero y cajero con caja abierta. */
  let r = await conRespuesta(erp.cambioTurno, { cajero_id: cajero3 }, { id: String(s1.id) });
  if (r.status !== 404) throw new Error(`Cambiar una caja cerrada debe dar 404 (dio ${r.status}).`);
  r = await conRespuesta(erp.cambioTurno, { cajero_id: cajero2 }, { id: String(nueva.id) });
  if (r.status !== 400) throw new Error(`El turno debe recibirlo otro cajero (dio ${r.status}).`);
  const aperturaCajero3 = await conRespuesta(beta2.openCash, { cajero_id: cajero3, sucursal_id: branch.id, punto_venta: pv, importe_apertura: 0 });
  if (aperturaCajero3.status !== 201) throw new Error(`No se pudo abrir caja del cajero 3: ${JSON.stringify(aperturaCajero3.payload)}`);
  r = await conRespuesta(erp.cambioTurno, { cajero_id: cajero3 }, { id: String(nueva.id) });
  if (r.status !== 409) throw new Error(`Un cajero con caja abierta no debe recibir el turno (dio ${r.status}).`);
  const cajeroInactivo = Number(
    db.prepare("INSERT INTO cajeros(empresa_id,codigo,nombre,activo) VALUES(?,?,?,0)").run(empresa.id, "CAJA5", "Cajero Inactivo").lastInsertRowid,
  );
  r = await conRespuesta(erp.cambioTurno, { cajero_id: cajeroInactivo }, { id: String(nueva.id) });
  if (r.status !== 404) throw new Error(`Un cajero inactivo no puede recibir el turno (dio ${r.status}).`);

  /* 5) Cierre normal del turno con diferencia. */
  const cierre = await conRespuesta(beta2.closeCash, { importe_contado: 2400, arqueo: { efectivo_contado: 2400 }, observaciones: "cierre turno" }, { id: String(nueva.id) });
  if (cierre.status !== 200) throw new Error(`No se pudo cerrar el turno: ${JSON.stringify(cierre.payload)}`);
  const cerrada2 = sesion(nueva.id);
  if (cerrada2.estado !== "CERRADA" || Number(cerrada2.diferencia) !== -100) throw new Error(`Diferencia de cierre incorrecta: ${cerrada2.diferencia}`);

  console.log("caja-turnos: OK — apertura automática por cajero, cambio de turno con arqueo y fondo, ventas en el turno correcto y validaciones.");
})();
