/*
 * Emisión fiscal de Notas de Crédito (NC) contra una factura autorizada.
 *
 * Reutiliza el emisor fiscal (emitirComprobanteAfip) y persiste el documento
 * comercial con su CAE, igual que el flujo del POS. Una NC siempre es fiscal
 * y debe referenciar la factura original (cbteAsoc).
 */
const db = require("../db/database");
const { nowLocal } = require("../utils/time");
const { emitirComprobanteAfip } = require("../afip/fiscalEmission.service");
const { registrarMovimientoCC } = require("../repositories/clienteCuentaCorriente.repository");

function afipObservacionesDe(fiscal) {
  if (fiscal && !fiscal.ok) return JSON.stringify(fiscal.errores || fiscal.observaciones || null);
  if (fiscal && fiscal.ok && fiscal.observaciones) return JSON.stringify(fiscal.observaciones);
  return null;
}

/*
 * Busca la factura original (autorizada) a creditar.
 * Si numero se informa, filtra por él; si no, toma la última
 * factura autorizada del cliente.
 */
function buscarFacturaOrigen({ empresaId, clienteId, numero }) {
  if (numero) {
    const limpio = String(numero).replace(/[^0-9]/g, "");
    const row = db
      .prepare(
        `SELECT * FROM documentos_comerciales
         WHERE empresa_id=? AND tipo LIKE 'FACTURA%' AND cae IS NOT NULL
           AND (
             (punto_venta=? AND numero=?) OR numero=? OR id=?
           )
         ORDER BY id DESC LIMIT 1`,
      )
      .get(empresaId, 0, 0, Number(limpio), Number(limpio));
    if (row) return row;
  }
  return db
    .prepare(
      `SELECT * FROM documentos_comerciales
       WHERE empresa_id=? AND cliente_id=? AND tipo LIKE 'FACTURA%' AND cae IS NOT NULL
       ORDER BY fecha DESC, id DESC LIMIT 1`,
    )
    .get(empresaId, clienteId);
}

async function emitirNotaCredito({ empresaId, clienteId, numero = null, condicionVenta = "CONTADO", usuarioId = null }) {
  const factura = buscarFacturaOrigen({ empresaId, clienteId, numero });
  if (!factura) {
    const error = new Error(
      "No encontré una factura autorizada para ese cliente. La nota de crédito debe referenciar una factura original.",
    );
    error.statusCode = 400;
    throw error;
  }

  const items = db
    .prepare("SELECT * FROM documento_items WHERE documento_id=? ORDER BY id")
    .all(factura.id);

  if (!items.length) {
    const error = new Error("La factura original no tiene ítems para creditar.");
    error.statusCode = 400;
    throw error;
  }

  const cliente = db
    .prepare("SELECT * FROM clientes WHERE id=? AND empresa_id=?")
    .get(clienteId, empresaId);

  const fiscal = await emitirComprobanteAfip({
    empresaId,
    puntoVenta: factura.punto_venta,
    clienteId,
    clienteNombre: cliente?.razon_social || "CONSUMIDOR FINAL",
    items,
    operacion: "NOTA_CREDITO",
    cbteAsoc: [
      {
        tipo: factura.comprobante_tipo_afip,
        puntoVenta: factura.punto_venta,
        numero: factura.numero,
      },
    ],
    documentoId: factura.id,
  });

  if (!fiscal.ok) {
    const error = new Error("AFIP rechazó la nota de crédito.");
    error.statusCode = 422;
    error.detalle = fiscal.observaciones || fiscal.errores || fiscal.resultado || null;
    error.afipEstado = "RECHAZADO";
    throw error;
  }

  const documentoId = db
    .prepare(
      `INSERT INTO documentos_comerciales(
        empresa_id, cliente_id, vendedor_id, tipo, estado, punto_venta, numero, fecha,
        condicion_venta, observaciones, importe_neto, importe_iva, importe_total,
        importe_bruto, descuento_general, descuento_importe, canal, cae, cae_vencimiento,
        comprobante_tipo_afip, comprobante_letra, afip_resultado, afip_observaciones, afip_estado
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      empresaId,
      clienteId,
      factura.vendedor_id || null,
      "NOTA_CREDITO",
      "CONFIRMADO",
      factura.punto_venta,
      fiscal.numero,
      nowLocal(),
      condicionVenta || "CONTADO",
      factura.observaciones || "",
      fiscal.importeNeto,
      fiscal.importeIva,
      fiscal.importeTotal,
      fiscal.importeNeto,
      0,
      0,
      "WHATSAPP",
      fiscal.cae || null,
      fiscal.vencimiento || null,
      fiscal.tipoComprobante || null,
      fiscal.letra || null,
      fiscal.resultado,
      afipObservacionesDe(fiscal),
      "AUTORIZADO",
    ).lastInsertRowId;

  const insItem = db.prepare(
    `INSERT INTO documento_items(
      documento_id, producto_id, codigo, descripcion, unidad, cantidad,
      precio_unitario, descuento, iva, subtotal, iva_importe, total
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const x of items) {
    const line = Number(x.precio_unitario || x.precio || 0) * Number(x.cantidad || 0) * (1 - Number(x.descuento || 0) / 100);
    insItem.run(
      documentoId,
      x.producto_id || null,
      x.codigo || "",
      x.descripcion,
      x.unidad || "UN",
      Number(x.cantidad),
      Number(x.precio_unitario || x.precio || 0),
      Number(x.descuento || 0),
      Number(x.iva || 21),
      line,
      0,
      line,
    );
  }

  db.prepare(
    `INSERT OR IGNORE INTO documento_relaciones(
      empresa_id, documento_origen_id, documento_destino_id, tipo, observaciones
    ) VALUES (?,?,?,?,?)`,
  ).run(
    empresaId,
    factura.id,
    documentoId,
    "NC",
    `NOTA_CREDITO de ${factura.punto_venta}-${factura.numero}`,
  );

  const esCtaCte = ["CTA_CTE", "CUENTA_CORRIENTE", "CUENTA CORRIENTE"].includes(
    String(condicionVenta || "").toUpperCase(),
  );
  if (esCtaCte && cliente) {
    registrarMovimientoCC({
      empresaId,
      clienteId: cliente.id,
      clienteDoc: cliente.cuit || cliente.dni || String(cliente.id),
      clienteNombre: cliente.razon_social,
      tipo: "NOTA_CREDITO",
      concepto: `NC ${String(factura.punto_venta).padStart(4, "0")}-${String(fiscal.numero).padStart(8, "0")}`,
      debe: 0,
      haber: fiscal.importeTotal,
      documentoId,
    });
  }

  return {
    documentId: documentoId,
    tipo: "NOTA_CREDITO",
    puntoVenta: factura.punto_venta,
    numero: fiscal.numero,
    cae: fiscal.cae,
    caeVencimiento: fiscal.vencimiento,
    comprobanteLetra: fiscal.letra,
    comprobanteNombre: fiscal.nombreComprobante,
    total: fiscal.importeTotal,
    afipEstado: "AUTORIZADO",
  };
}

module.exports = { emitirNotaCredito, buscarFacturaOrigen };
