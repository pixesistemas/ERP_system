const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/offline-pos-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

/*
 * En la prueba no hay certificados ni internet: se reemplaza el servicio
 * de emisión fiscal por uno simulado que devuelve un CAE válido. Así se
 * prueba la sincronización completa (la emisión real ya está cubierta por
 * los demás tests y por producción).
 */
const fiscalPath = require.resolve("../src/afip/fiscalEmission.service");
class FiscalNetworkError extends Error {}
require.cache[fiscalPath] = {
  id: fiscalPath,
  filename: fiscalPath,
  loaded: true,
  exports: {
    FiscalNetworkError,
    emitirComprobanteAfip: async ({ items = [] }) => {
      const neto = items.reduce(
        (n, x) => n + Number(x.precio_unitario || x.precio || 0) * Number(x.cantidad || 0) * (1 - Number(x.descuento || 0) / 100),
        0,
      );
      const importeNeto = Math.round(neto * 100) / 100;
      const importeIva = Math.round(importeNeto * 0.21 * 100) / 100;
      return {
        ok: true,
        numero: 4711,
        cae: "70123456789012",
        vencimiento: "2026-11-25",
        tipoComprobante: 6,
        letra: "C",
        nombreComprobante: "FACTURA C",
        resultado: "A",
        importeNeto,
        importeIva,
        importeTotal: Math.round((importeNeto + importeIva) * 100) / 100,
      };
    },
  },
};

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const offline = require("../src/controllers/offline.controller");

const empresa = db.prepare("SELECT * FROM empresas WHERE nombre='empresa1'").get();
if (!empresa) throw new Error("No se encontró la empresa demo del seed.");
/* Módulos como en producción: la migración 097 los activa en las empresas existentes. */
for (const modulo of ["REMITOS", "CHEQUES", "RESERVAS_MONTO", "PROVEEDORES"]) {
  db.prepare(
    "INSERT OR IGNORE INTO modulos_empresa(empresa_id,modulo,activo,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP)",
  ).run(empresa.id, modulo);
}
const producto = db.prepare("SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
if (!producto) throw new Error("El seed demo no tiene productos.");

const DISPOSITIVO = "terminal-caja-1";

async function sync(operaciones, dispositivo = DISPOSITIVO) {
  let status = 200;
  let payload = null;
  const req = {
    empresa: { id: empresa.id },
    user: { id: 1, empresaId: empresa.id },
    body: { dispositivo, operaciones },
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
  let errorNext = null;
  await offline.sincronizarOperaciones(req, res, (e) => {
    errorNext = e;
  });
  if (errorNext) throw errorNext;
  return { status, payload };
}

function item(cantidad = 2, precio = 1000) {
  return {
    producto_id: producto.id,
    codigo: producto.codigo,
    descripcion: producto.descripcion,
    unidad: "UN",
    cantidad,
    precio_unitario: precio,
    iva: 21,
    costo: 0,
  };
}

(async () => {
  /* 1) Remito X hecho sin conexión (no fiscal, mueve stock): se aplica. */
  const opRemito = {
    uuid: "uuid-remito-1",
    tipo: "VENTA_POS",
    creado_en: "2026-10-15 10:30:00",
    payload: {
      mode: "REMITO_X",
      cliente_nombre: "CONSUMIDOR FINAL",
      punto_venta: 1,
      condicion_pago: "CONTADO",
      subtotal: 2000,
      total: 2000,
      pagos: {},
      items: [item(2, 1000)],
    },
  };
  const r1 = await sync([opRemito]);
  if (r1.status !== 200 || r1.payload.aplicadas !== 1 || r1.payload.rechazadas !== 0) {
    throw new Error(`La venta offline no se aplicó: ${JSON.stringify(r1.payload)}`);
  }
  const ventaRemito = db
    .prepare("SELECT * FROM ventas_pos WHERE empresa_id=? AND uuid=?")
    .get(empresa.id, "uuid-remito-1");
  if (!ventaRemito) throw new Error("No se creó la venta del remito offline.");
  if (String(ventaRemito.fecha) !== "2026-10-15 10:30:00") {
    throw new Error(`La venta no conservó la fecha real de cobro: ${ventaRemito.fecha}`);
  }
  const salida = db
    .prepare("SELECT COUNT(*) n FROM stock_movimientos WHERE documento_id=? AND tipo='SALIDA_VENTA'")
    .get(ventaRemito.id).n;
  if (salida !== 1) throw new Error(`No se descontó el stock en la sincronización (movimientos: ${salida}).`);

  /* 2) Reintentar la misma operación: duplicada, sin efectos nuevos. */
  const r2 = await sync([opRemito]);
  if (r2.payload.duplicadas !== 1 || r2.payload.aplicadas !== 0) {
    throw new Error(`El reintento duplicó la venta: ${JSON.stringify(r2.payload)}`);
  }
  const ventasRemito = db
    .prepare("SELECT COUNT(*) n FROM ventas_pos WHERE empresa_id=? AND uuid=?")
    .get(empresa.id, "uuid-remito-1").n;
  const salidas = db
    .prepare("SELECT COUNT(*) n FROM stock_movimientos WHERE documento_id=? AND tipo='SALIDA_VENTA'")
    .get(ventaRemito.id).n;
  if (ventasRemito !== 1 || salidas !== 1) throw new Error("El reintento generó movimientos repetidos.");

  /* 3) Factura electrónica hecha sin conexión: se factura sola al sincronizar. */
  const opFactura = {
    uuid: "uuid-factura-1",
    tipo: "VENTA_POS",
    creado_en: "2026-10-15 11:05:00",
    payload: {
      mode: "NORMAL",
      document_kind: "FACTURA_ELECTRONICA",
      cliente_nombre: "CONSUMIDOR FINAL",
      punto_venta: 1,
      condicion_pago: "CONTADO",
      subtotal: 1000,
      total: 1210,
      pagos: { EFECTIVO: 1210 },
      items: [item(1, 1000)],
    },
  };
  const r3 = await sync([opFactura]);
  if (r3.payload.aplicadas !== 1) throw new Error(`La factura offline no se aplicó: ${JSON.stringify(r3.payload)}`);
  const ventaFactura = db
    .prepare(
      `SELECT v.*,d.cae,d.afip_estado,d.estado doc_estado,d.comprobante_tipo_afip
       FROM ventas_pos v JOIN documentos_comerciales d ON d.id=v.documento_id
       WHERE v.empresa_id=? AND v.uuid=?`,
    )
    .get(empresa.id, "uuid-factura-1");
  if (!ventaFactura) throw new Error("No se creó la venta de la factura offline.");
  if (ventaFactura.cae !== "70123456789012" || ventaFactura.afip_estado !== "AUTORIZADO") {
    throw new Error(`La factura no quedó autorizada con CAE: ${JSON.stringify(ventaFactura)}`);
  }
  const caja = db
    .prepare("SELECT COUNT(*) n FROM caja_movimientos WHERE venta_id=? AND tipo='VENTA'")
    .get(ventaFactura.id).n;
  if (caja !== 1) throw new Error("La factura sincronizada no registró el movimiento de caja.");

  /* 4) Tipo no soportado y falta de uuid: rechazos claros sin tocar datos. */
  const r4 = await sync([
    { uuid: "uuid-cobro-1", tipo: "COBRO_CC", payload: { cliente_id: 1, importe: 100 } },
    { tipo: "VENTA_POS", payload: { items: [item()] } },
  ]);
  if (r4.payload.rechazadas !== 2) throw new Error("Los rechazos esperados no coinciden.");
  if (!String(r4.payload.resultados[0].error).includes("no soportado")) {
    throw new Error(`El rechazo de tipo no soportado no es claro: ${r4.payload.resultados[0].error}`);
  }

  /* 5) Lote demasiado grande: se corta antes de procesar nada. */
  const loteGrande = Array.from({ length: 26 }, (_, i) => ({
    uuid: `uuid-lote-${i}`,
    tipo: "VENTA_POS",
    payload: opRemito.payload,
  }));
  const r5 = await sync(loteGrande);
  if (r5.status !== 400 || !String(r5.payload.error).includes("Máximo")) {
    throw new Error(`El límite de lote no se aplicó: ${JSON.stringify(r5.payload)}`);
  }

  /* 6) Auditoría: operaciones guardadas con su estado y dispositivo registrado. */
  const aud = db.prepare("SELECT uuid,estado FROM offline_operaciones WHERE empresa_id=? ORDER BY id").all(empresa.id);
  const estado = Object.fromEntries(aud.map((x) => [x.uuid, x.estado]));
  if (estado["uuid-remito-1"] !== "APLICADA" || estado["uuid-factura-1"] !== "APLICADA" || estado["uuid-cobro-1"] !== "RECHAZADA") {
    throw new Error(`La auditoría de operaciones offline quedó mal: ${JSON.stringify(estado)}`);
  }
  const dispositivo = db
    .prepare("SELECT * FROM sync_dispositivos WHERE empresa_id=? AND device_id=?")
    .get(empresa.id, DISPOSITIVO);
  if (!dispositivo || dispositivo.origen !== "POS") throw new Error("El dispositivo del POS no quedó registrado.");

  console.log("offline-pos: OK — venta offline aplicada con fecha real, reintento sin duplicar, factura con CAE al sincronizar, rechazos claros y dispositivo registrado.");
})();
