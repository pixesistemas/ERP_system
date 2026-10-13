const db = require("../db/database");
const { nowLocal } = require("../utils/time");

/*
 * Conexión con Tiendanube (https://tiendanube.com).
 *
 * Integración "a demanda" para no consumir recursos del servidor: no hay
 * procesos en segundo plano, todo se ejecuta cuando el usuario toca un
 * botón (probar, exportar productos, exportar stock, importar pedidos).
 *
 * La configuración (store id + access token) se guarda por empresa en
 * app_state, nunca en el repositorio.
 */

const USER_AGENT = "PixeSistemas ERP (soporte@pixesistemas.com.ar)";
const CLAVE_CONFIG = "tiendanube_config";
const CLAVE_MAPA = "tiendanube_map";

function leerJson(clave, empresaId, porDefecto) {
  try {
    const row = db
      .prepare("SELECT valor_json FROM app_state WHERE empresa_id=? AND clave=?")
      .get(empresaId, clave);
    return row ? JSON.parse(row.valor_json) : porDefecto;
  } catch (e) {
    return porDefecto;
  }
}

function guardarJson(clave, empresaId, valor) {
  db.prepare(
    `INSERT INTO app_state(empresa_id,clave,valor_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(empresa_id,clave) DO UPDATE SET valor_json=excluded.valor_json,updated_at=CURRENT_TIMESTAMP`,
  ).run(empresaId, clave, JSON.stringify(valor));
}

function getConfig(empresaId) {
  const base = leerJson(CLAVE_CONFIG, empresaId, {});
  return {
    storeId: String(base.storeId || ""),
    token: String(base.token || ""),
    activo: Boolean(base.activo),
    ultimaSync: base.ultimaSync || null,
    ultimoPedidoId: Number(base.ultimoPedidoId || 0),
  };
}

function getConfigPublica(empresaId) {
  const cfg = getConfig(empresaId);
  return {
    storeId: cfg.storeId,
    activo: cfg.activo,
    configurado: Boolean(cfg.storeId && cfg.token),
    tokenCargado: Boolean(cfg.token),
    ultimaSync: cfg.ultimaSync,
    ultimoPedidoId: cfg.ultimoPedidoId,
  };
}

function saveConfig(empresaId, { storeId, token, activo }) {
  const actual = getConfig(empresaId);
  const next = {
    ...actual,
    storeId: storeId !== undefined && storeId !== null ? String(storeId).trim() : actual.storeId,
    token: token ? String(token).trim() : actual.token,
    activo: activo !== undefined && activo !== null ? Boolean(activo) : actual.activo,
  };
  guardarJson(CLAVE_CONFIG, empresaId, next);
  return getConfigPublica(empresaId);
}

async function tnFetch(empresaId, path, options = {}) {
  const cfg = getConfig(empresaId);
  if (!cfg.storeId || !cfg.token) {
    throw Object.assign(new Error("Completá el ID de tienda y el token de Tiendanube."), { statusCode: 400 });
  }
  const resp = await fetch(`https://api.tiendanube.com/v1/${cfg.storeId}${path}`, {
    ...options,
    headers: {
      Authentication: `bearer ${cfg.token}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const detalle = data?.description || data?.message || data?.error || `HTTP ${resp.status}`;
    throw Object.assign(new Error(`Tiendanube respondió: ${detalle}`), { statusCode: 422 });
  }
  return data;
}

async function probar(empresaId) {
  const data = await tnFetch(empresaId, "/products?per_page=1");
  guardarJson(CLAVE_CONFIG, empresaId, { ...getConfig(empresaId), ultimaSync: nowLocal() });
  return { ok: true, productosEnTienda: Array.isArray(data) ? data.length : 0, mensaje: "Conexión correcta con Tiendanube." };
}

/* Stock actual del depósito principal (suma por producto). */
function stockDeProductos(empresaId) {
  const rows = db
    .prepare("SELECT producto_id, COALESCE(SUM(cantidad),0) cantidad FROM stock_productos WHERE empresa_id=? GROUP BY producto_id")
    .all(empresaId);
  return new Map(rows.map((r) => [Number(r.producto_id), Number(r.cantidad)]));
}

/*
 * Exporta productos (los que todavía no están vinculados) a Tiendanube.
 * Procesa de a lotes para no consumir tiempo ni memoria del servidor.
 */
async function exportarProductos(empresaId, { limite = 30 } = {}) {
  const mapa = leerJson(CLAVE_MAPA, empresaId, {});
  const productos = db
    .prepare("SELECT id,codigo,descripcion,precio FROM productos WHERE empresa_id=? AND activo=1 ORDER BY id")
    .all(empresaId)
    .filter((p) => !mapa[String(p.id)]);
  const stock = stockDeProductos(empresaId);
  const lote = productos.slice(0, Math.max(1, Number(limite) || 30));
  let enviados = 0;
  const errores = [];
  for (const p of lote) {
    try {
      const creado = await tnFetch(empresaId, "/products", {
        method: "POST",
        body: JSON.stringify({
          name: { es: p.descripcion },
          description: { es: "" },
          variants: [
            {
              price: String(Number(p.precio || 0).toFixed(2)),
              stock: Math.max(0, Math.round(stock.get(Number(p.id)) || 0)),
              sku: p.codigo || undefined,
            },
          ],
        }),
      });
      mapa[String(p.id)] = {
        tnProductId: creado.id,
        tnVariantId: creado.variants?.[0]?.id || null,
        codigo: p.codigo || "",
      };
      enviados++;
    } catch (error) {
      errores.push(`${p.codigo || p.id}: ${error.message}`);
      if (errores.length >= 5) break;
    }
  }
  guardarJson(CLAVE_MAPA, empresaId, mapa);
  guardarJson(CLAVE_CONFIG, empresaId, { ...getConfig(empresaId), ultimaSync: nowLocal() });
  return { enviados, errores, restantes: Math.max(0, productos.length - enviados) };
}

/* Actualiza el stock en Tiendanube de los productos ya vinculados. */
async function exportarStock(empresaId, { limite = 30 } = {}) {
  const mapa = leerJson(CLAVE_MAPA, empresaId, {});
  const stock = stockDeProductos(empresaId);
  const vinculados = Object.entries(mapa).slice(0, Math.max(1, Number(limite) || 30));
  let actualizados = 0;
  const errores = [];
  for (const [productoId, info] of vinculados) {
    if (!info?.tnProductId || !info?.tnVariantId) continue;
    try {
      await tnFetch(empresaId, `/products/${info.tnProductId}/variants/${info.tnVariantId}`, {
        method: "PUT",
        body: JSON.stringify({ stock: Math.max(0, Math.round(stock.get(Number(productoId)) || 0)) }),
      });
      actualizados++;
    } catch (error) {
      errores.push(`${info.codigo || productoId}: ${error.message}`);
      if (errores.length >= 5) break;
    }
  }
  guardarJson(CLAVE_CONFIG, empresaId, { ...getConfig(empresaId), ultimaSync: nowLocal() });
  return { actualizados, errores, vinculados: Object.keys(mapa).length };
}

/*
 * Importa los pedidos nuevos de la tienda como notas de pedido del ERP.
 * Usa el uuid "tn-<id>" para no duplicar si se toca dos veces.
 */
async function importarPedidos(empresaId, { limite = 20 } = {}) {
  const cfg = getConfig(empresaId);
  const pedidos = await tnFetch(empresaId, `/orders?per_page=${Math.max(1, Number(limite) || 20)}&page=1`);
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const nuevos = lista.filter((o) => Number(o.id) > Number(cfg.ultimoPedidoId || 0));
  let importados = 0;
  let primeroSinMapear = null;
  const errores = [];
  const productoPorCodigo = new Map(
    db
      .prepare("SELECT id,codigo,descripcion,precio,iva,rubro_id FROM productos WHERE empresa_id=? AND activo=1")
      .all(empresaId)
      .map((p) => [String(p.codigo || "").toLowerCase(), p]),
  );
  for (const orden of nuevos) {
    const uuid = `tn-${orden.id}`;
    const existe = db.prepare("SELECT id FROM ventas_pos WHERE empresa_id=? AND uuid=?").get(empresaId, uuid);
    if (existe) {
      cfg.ultimoPedidoId = Math.max(Number(cfg.ultimoPedidoId || 0), Number(orden.id));
      continue;
    }
    try {
      /*
       * El precio de Tiendanube es el final (IVA incluido): se separa el
       * neto y el IVA para que la facturación posterior salga bien.
       */
      const items = (orden.products || []).map((i) => {
        const prod = productoPorCodigo.get(String(i.sku || "").toLowerCase()) || null;
        if (!prod) primeroSinMapear = primeroSinMapear || `${i.name || i.sku || "producto"} (SKU ${i.sku || "sin SKU"})`;
        const precioFinal = Number(i.price || 0);
        const ivaPorc = Number(prod?.iva ?? 21);
        const neto = ivaPorc > 0 ? Math.round((precioFinal / (1 + ivaPorc / 100)) * 100) / 100 : precioFinal;
        const cantidad = Number(i.quantity || 1);
        return {
          producto_id: prod?.id || null,
          codigo: i.sku || prod?.codigo || "",
          descripcion: i.name || prod?.descripcion || "Producto Tiendanube",
          cantidad,
          precioNeto: neto,
          precioFinal,
          iva: ivaPorc,
          ivaImporte: Math.round((precioFinal - neto) * cantidad * 100) / 100,
          subtotalNeto: Math.round(neto * cantidad * 100) / 100,
          totalLinea: Math.round(precioFinal * cantidad * 100) / 100,
          rubro_id: prod?.rubro_id ?? null,
        };
      });
      if (!items.length) {
        cfg.ultimoPedidoId = Math.max(Number(cfg.ultimoPedidoId || 0), Number(orden.id));
        continue;
      }
      const clienteNombre = orden.contact_name || orden.customer?.name || "CLIENTE TIENDANUBE";
      const subtotal = Math.round(items.reduce((n, i) => n + i.subtotalNeto, 0) * 100) / 100;
      const ivaTotal = Math.round(items.reduce((n, i) => n + i.ivaImporte, 0) * 100) / 100;
      const total = Math.round(items.reduce((n, i) => n + i.totalLinea, 0) * 100) / 100;
      const fecha = String(orden.created_at || nowLocal()).slice(0, 10);
      const numeroPedido = Number(orden.number || orden.id) % 100000000;
      const observaciones = `Pedido Tiendanube #${orden.number || orden.id} · ${clienteNombre}${orden.contact_phone ? ` · Tel. ${orden.contact_phone}` : ""}`;
      const tx = db.transaction(() => {
        const doc = db
          .prepare(
            `INSERT INTO documentos_comerciales(empresa_id,cliente_id,tipo,estado,punto_venta,numero,fecha,condicion_venta,observaciones,importe_neto,importe_iva,importe_total,importe_bruto,descuento_general,descuento_importe,canal,subtipo)
             VALUES(?,NULL,'NOTA_PEDIDO','BORRADOR',1,?,?,'CONTADO',?,?,?,?,?,0,0,'TIENDANUBE','X')`,
          )
          .run(empresaId, numeroPedido, fecha, observaciones, subtotal, ivaTotal, total, subtotal);
        const insDoc = db.prepare(
          "INSERT INTO documento_items(documento_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total,rubro_id) VALUES(?,?,?,?,?,?,?,0,?,?,?,?,?)",
        );
        for (const i of items) insDoc.run(doc.lastInsertRowid, i.producto_id, i.codigo, i.descripcion, "UN", i.cantidad, i.precioNeto, i.iva, i.subtotalNeto, i.ivaImporte, i.totalLinea, i.rubro_id);
        const sale = db
          .prepare(
            `INSERT INTO ventas_pos(empresa_id,cliente_id,punto_venta,numero,tipo,estado,estado_pedido,fecha,condicion_pago,observaciones,subtotal,total,documento_id,formato_impresion,uuid)
             VALUES(?,NULL,1,?,'NOTA_PEDIDO','PENDIENTE','PENDIENTE',?,'CONTADO',?,?,?,?,'A4',?)`,
          )
          .run(empresaId, numeroPedido, fecha, observaciones, subtotal, total, doc.lastInsertRowid, uuid);
        const insItem = db.prepare(
          "INSERT INTO venta_pos_items(venta_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,costo_unitario,subtotal,promocion,rubro_id) VALUES(?,?,?,?,?,?,?,0,?,0,?,0,?)",
        );
        for (const i of items) insItem.run(sale.lastInsertRowid, i.producto_id, i.codigo, i.descripcion, "UN", i.cantidad, i.precioNeto, i.iva, i.subtotalNeto, i.rubro_id);
        db.prepare(
          "INSERT INTO pedido_estado_historial(empresa_id,venta_id,documento_id,estado,usuario_id,usuario_nombre,detalle,created_at) VALUES(?,?,?,'PENDIENTE',NULL,'TIENDANUBE',?,?)",
        ).run(empresaId, sale.lastInsertRowid, doc.lastInsertRowid, `Pedido importado de Tiendanube #${orden.number || orden.id}`, nowLocal());
      });
      tx();
      importados++;
      cfg.ultimoPedidoId = Math.max(Number(cfg.ultimoPedidoId || 0), Number(orden.id));
    } catch (error) {
      errores.push(`Pedido ${orden.number || orden.id}: ${error.message}`);
      if (errores.length >= 5) break;
    }
  }
  guardarJson(CLAVE_CONFIG, empresaId, { ...cfg, ultimaSync: nowLocal() });
  return { importados, errores, ultimoPedidoId: cfg.ultimoPedidoId, sinMapear: primeroSinMapear };
}

module.exports = {
  getConfigPublica,
  saveConfig,
  probar,
  exportarProductos,
  exportarStock,
  importarPedidos,
};
