const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const db = require("../db/database");
const repo = require("../repositories/recepcion.repository");
const stockRepo = require("../repositories/stock.repository");
const syncEmpresas = require("./syncEmpresas.service");

const ESTADOS = new Set(["BORRADOR", "CONFIRMADA", "ANULADA"]);

function error(mensaje, statusCode = 400, details = null) {
  const e = new Error(mensaje);
  e.statusCode = statusCode;
  if (details) e.details = details;
  return e;
}

function bool(valor) {
  return valor === true || valor === 1 || valor === "1" || valor === "true";
}

function numero(valor, defecto = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : defecto;
}

function redondear(valor, decimales = 2) {
  const factor = 10 ** decimales;
  return Math.round((numero(valor) + Number.EPSILON) * factor) / factor;
}

function normalizarTexto(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizarCodigo(valor) {
  return String(valor || "").trim().toUpperCase();
}

function requirePermiso(permisos, permiso) {
  if (!Array.isArray(permisos) || !permisos.includes(permiso)) {
    throw error(`Te falta el permiso ${permiso}.`, 403);
  }
}

function limpiarArchivo(pathRelativo) {
  if (!pathRelativo) return;
  const absoluto = path.join(process.cwd(), pathRelativo.replace(/^\/+/, ""));
  try {
    fs.unlinkSync(absoluto);
  } catch {}
}

function guardarArchivo({ empresaId, buffer, mime, nombre }) {
  if (!buffer?.length) return {};
  const ext =
    mime === "application/pdf"
      ? ".pdf"
      : mime === "image/png"
        ? ".png"
        : mime === "image/webp"
          ? ".webp"
          : ".jpg";
  const carpeta = path.join(process.cwd(), "storage", "recepciones", String(empresaId));
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = `${Date.now()}-${uuidv4()}${ext}`;
  fs.writeFileSync(path.join(carpeta, archivo), buffer);
  const relativo = `storage/recepciones/${empresaId}/${archivo}`;
  return {
    archivo_nombre: String(nombre || archivo).slice(0, 255),
    archivo_mime: mime,
    archivo_path: relativo,
    archivo_url: `/${relativo.replace(/\\/g, "/")}`,
  };
}

function normalizarCabecera(input = {}) {
  const d = input.cabecera && typeof input.cabecera === "object" ? input.cabecera : input;
  const empresaId = Number(d.empresa_id || input.empresa_id || 0);
  const proveedorId = Number(d.proveedor_id || 0) || null;
  const proveedor = proveedorId
    ? repo.getProveedor({ empresaId, proveedorId })
    : repo.findProveedor({
        empresaId,
        documento: d.proveedor_documento,
        nombre: d.proveedor_nombre,
      });

  const puntoVenta = d.punto_venta === "" || d.punto_venta == null
    ? null
    : Math.max(0, Math.trunc(numero(d.punto_venta, 0)));
  const fecha = String(d.fecha || "").slice(0, 10);

  return {
    empresa_id: empresaId,
    proveedor_id: proveedor?.id || null,
    proveedor_nombre: String(d.proveedor_nombre || proveedor?.nombre || "").trim(),
    proveedor_documento: String(
      d.proveedor_documento || proveedor?.cuit || "",
    ).replace(/[^\d]/g, ""),
    proveedor_condicion_iva: String(
      d.proveedor_condicion_iva || proveedor?.condicion_iva || "",
    ).trim(),
    proveedor_domicilio: String(d.proveedor_domicilio || proveedor?.domicilio || "").trim(),
    tipo_comprobante: String(d.tipo_comprobante || "").trim().toUpperCase(),
    letra: String(d.letra || "").trim().toUpperCase().slice(0, 1),
    punto_venta: puntoVenta,
    numero: String(d.numero || "").trim(),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : new Date().toISOString().slice(0, 10),
    fecha_vencimiento: /^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha_vencimiento || ""))
      ? String(d.fecha_vencimiento)
      : null,
    condicion_pago: String(d.condicion_pago || "CONTADO").trim(),
    moneda: String(d.moneda || "PES").trim().toUpperCase() || "PES",
    cotizacion: Math.max(0.000001, numero(d.cotizacion, 1)),
    deposito_id: Number(d.deposito_id || input.deposito_id || 0) || null,
    crear_factura: bool(d.crear_factura) ? 1 : 0,
    actualizar_costo: bool(d.actualizar_costo) ? 1 : 0,
    actualizar_precio: bool(d.actualizar_precio) ? 1 : 0,
    costo_incluye_iva: bool(d.costo_incluye_iva) ? 1 : 0,
    margen_porcentaje: numero(d.margen_porcentaje, 30),
    permitir_parcial: bool(d.permitir_parcial) ? 1 : 0,
    permitir_diferencia_total: bool(d.permitir_diferencia_total) ? 1 : 0,
    observaciones: String(d.observaciones || "").trim(),
    total_documento: Math.max(0, numero(d.total_documento ?? d.total, 0)),
    exento_no_gravado: Math.max(0, numero(d.exento_no_gravado, 0)),
    percepciones: Math.max(0, numero(d.percepciones, 0)),
    origen: String(d.origen || input.origen || "MANUAL").toUpperCase(),
  };
}

function normalizarItem(item = {}, indice = 0) {
  const productoId = Number(item.producto_id || 0) || null;
  const cantidadFacturada = Math.max(0, numero(item.cantidad_facturada ?? item.cantidad));
  const cantidadRecibida = Math.max(0, numero(item.cantidad_recibida));
  const costo = Math.max(0, numero(item.costo_unitario));
  const iva = Math.max(0, numero(item.iva, 21));
  const precioNuevo =
    item.precio_venta_nuevo === "" || item.precio_venta_nuevo == null
      ? null
      : Math.max(0, numero(item.precio_venta_nuevo));

  return {
    linea: indice + 1,
    producto_id: productoId,
    codigo: String(item.codigo || "").trim(),
    codigo_barra: String(item.codigo_barra || "").trim(),
    descripcion: String(item.descripcion || "").trim(),
    codigo_proveedor: String(item.codigo_proveedor || "").trim(),
    cantidad_facturada: cantidadFacturada,
    cantidad_recibida: cantidadRecibida,
    unidad: String(item.unidad || "UN").trim().toUpperCase().slice(0, 12) || "UN",
    costo_unitario: costo,
    costo_neto: 0,
    descuento: Math.max(0, numero(item.descuento)),
    iva,
    importe: 0,
    precio_venta_actual: Math.max(0, numero(item.precio_venta_actual)),
    precio_venta_nuevo: precioNuevo,
    precio_venta_manual: bool(item.precio_venta_manual),
    costo_anterior: null,
    precio_anterior: null,
    stock_actual: 0,
    diferencia_motivo: String(item.diferencia_motivo || "").trim(),
    revisar: bool(item.revisar),
    confianza: String(item.confianza || "").trim().toUpperCase(),
  };
}

function construirIndices(empresaId, proveedorId) {
  const productos = repo.listarProductosBase(empresaId);
  const porId = new Map();
  const porCodigo = new Map();
  const porBarra = new Map();
  const porDescripcion = new Map();

  for (const producto of productos) {
    porId.set(Number(producto.id), producto);
    const codigo = normalizarCodigo(producto.codigo);
    if (codigo && !porCodigo.has(codigo)) porCodigo.set(codigo, producto);
    const barra = String(producto.codigo_barra || "").trim();
    if (barra && !porBarra.has(barra)) porBarra.set(barra, producto);
    const descripcion = normalizarTexto(producto.descripcion);
    if (descripcion && !porDescripcion.has(descripcion)) {
      porDescripcion.set(descripcion, producto);
    }
  }

  for (const extra of repo.listarCodigosBarras(empresaId)) {
    const producto = porId.get(Number(extra.producto_id));
    const barra = String(extra.codigo_barra || "").trim();
    if (producto && barra && !porBarra.has(barra)) porBarra.set(barra, producto);
  }

  const porCodigoProveedor = new Map();
  for (const mapeo of repo.listarMapeosProveedor({ empresaId, proveedorId })) {
    const codigo = normalizarCodigo(mapeo.codigo_proveedor);
    const producto = porId.get(Number(mapeo.producto_id));
    if (codigo && producto) porCodigoProveedor.set(codigo, producto);
  }

  return { porId, porCodigo, porBarra, porDescripcion, porCodigoProveedor };
}

function aplicarMatching({ empresaId, cabecera, items }) {
  const indices = construirIndices(empresaId, cabecera.proveedor_id);
  return items.map((item) => {
    let producto = null;
    if (item.producto_id) {
      producto = indices.porId.get(Number(item.producto_id)) || null;
    }
    if (!producto) {
      const codigoProveedor = normalizarCodigo(item.codigo_proveedor);
      if (codigoProveedor) {
        producto = indices.porCodigoProveedor.get(codigoProveedor) || null;
      }
    }
    if (!producto && item.codigo_barra) {
      producto = indices.porBarra.get(String(item.codigo_barra).trim()) || null;
    }
    if (!producto && item.codigo) {
      producto = indices.porCodigo.get(normalizarCodigo(item.codigo)) || null;
    }
    if (!producto && item.descripcion) {
      producto = indices.porDescripcion.get(normalizarTexto(item.descripcion)) || null;
    }

    if (!producto) {
      return {
        ...item,
        producto_id: null,
        revisar: true,
        estado_identificacion: "PENDIENTE",
      };
    }

    return {
      ...item,
      producto_id: Number(producto.id),
      codigo: item.codigo || producto.codigo || "",
      codigo_barra: item.codigo_barra || producto.codigo_barra || "",
      descripcion: item.descripcion || producto.descripcion || "",
      unidad: item.unidad || producto.unidad || "UN",
      iva: item.iva || Number(producto.iva ?? 21),
      precio_venta_actual: numero(producto.precio),
      estado_identificacion: "IDENTIFICADO",
      revisar: false,
    };
  });
}

function recalcular({ empresaId, cabecera, items, depositoId }) {
  const productos = new Map();
  const calculados = items.map((item) => {
    const productoId = Number(item.producto_id || 0) || null;
    let producto = null;
    if (productoId) {
      if (!productos.has(productoId)) {
        productos.set(productoId, repo.getProducto({ empresaId, productoId }));
      }
      producto = productos.get(productoId);
    }

    const iva = Math.max(0, numero(item.iva, Number(producto?.iva ?? 21)));
    const costoUnitario = Math.max(0, numero(item.costo_unitario));
    const costoNeto = cabecera.costo_incluye_iva
      ? costoUnitario / (1 + iva / 100)
      : costoUnitario;
    const baseLinea = costoNeto * numero(item.cantidad_facturada) * (1 - numero(item.descuento) / 100);
    const importe = baseLinea * (1 + iva / 100);
    const stock = producto
      ? numero(repo.getStock({ empresaId, depositoId, productoId })?.cantidad)
      : 0;

    let precioNuevo = item.precio_venta_nuevo;
    if (cabecera.actualizar_precio && producto) {
      if (!item.precio_venta_manual || precioNuevo === null || precioNuevo <= 0) {
        precioNuevo = costoNeto * (1 + iva / 100) * (1 + cabecera.margen_porcentaje / 100);
      }
    }
    if (precioNuevo !== null) precioNuevo = redondear(precioNuevo, 2);

    return {
      ...item,
      producto_id: producto ? Number(producto.id) : null,
      codigo: item.codigo || producto?.codigo || "",
      codigo_barra: item.codigo_barra || producto?.codigo_barra || "",
      descripcion: item.descripcion || producto?.descripcion || "",
      unidad: item.unidad || producto?.unidad || "UN",
      iva,
      costo_neto: redondear(costoNeto, 6),
      importe: redondear(importe, 2),
      precio_venta_actual: producto ? numero(producto.precio) : 0,
      precio_venta_nuevo: precioNuevo,
      costo_anterior: producto ? numero(producto.costo) : null,
      precio_anterior: producto ? numero(producto.precio) : null,
      stock_actual: stock,
      estado_identificacion: producto ? "IDENTIFICADO" : "PENDIENTE",
      revisar: producto ? item.revisar : true,
    };
  });

  let subtotal = 0;
  let ivaTotal = 0;
  for (const item of calculados) {
    const base = numero(item.costo_neto) * numero(item.cantidad_facturada) *
      (1 - numero(item.descuento) / 100);
    subtotal += base;
    ivaTotal += base * (numero(item.iva) / 100);
  }
  subtotal = redondear(subtotal, 2);
  ivaTotal = redondear(ivaTotal, 2);
  const total = redondear(subtotal + ivaTotal + numero(cabecera.exento_no_gravado) + numero(cabecera.percepciones), 2);
  const totalDocumento = cabecera.total_documento > 0 ? redondear(cabecera.total_documento, 2) : total;
  const diferencia = redondear(totalDocumento - total, 2);

  return {
    items: calculados,
    totales: {
      subtotal,
      iva: ivaTotal,
      total,
      total_documento: totalDocumento,
      diferencia_total: diferencia,
    },
  };
}

function preparar({ empresaId, input, depositoId }) {
  const cabecera = normalizarCabecera({ ...input, empresa_id: empresaId });
  if (!cabecera.deposito_id && depositoId) cabecera.deposito_id = depositoId;

  const itemsEntrada = Array.isArray(input.items)
    ? input.items
    : Array.isArray(input.cabecera?.items)
      ? input.cabecera.items
      : [];
  let items = itemsEntrada.map((item, indice) => normalizarItem(item, indice));
  items = aplicarMatching({ empresaId, cabecera, items });
  const { items: itemsCalculados, totales } = recalcular({
    empresaId,
    cabecera,
    items,
    depositoId: cabecera.deposito_id,
  });

  return { cabecera, items: itemsCalculados, totales };
}

function validarDeposito({ empresaId, depositoId }) {
  const deposito = repo.getDeposito({ empresaId, depositoId });
  if (!deposito) throw error("Elegí un depósito válido y activo.");
  return deposito;
}

function obtenerRecepcion({ empresaId, id }) {
  const recepcion = repo.getRecepcion({ empresaId, id });
  if (!recepcion) throw error("La recepción no existe.", 404);
  return recepcion;
}

function listar({ empresaId, limit, estado }) {
  return repo.listarRecepciones({ empresaId, limit, estado });
}

function crear({ empresaId, usuarioId, input = {} }) {
  const uuid = String(input.uuid || "").trim() || uuidv4();
  const existente = repo.findRecepcionByUuid({ empresaId, uuid });
  if (existente) return obtenerRecepcion({ empresaId, id: existente.id });

  const depositoId = Number(input.deposito_id || 0) ||
    Number(repo.getDepositoPrincipal(empresaId)?.id || 0);
  if (!depositoId) throw error("No hay un depósito activo. Creá uno antes de recibir mercadería.");
  validarDeposito({ empresaId, depositoId });

  const preparado = preparar({ empresaId, input, depositoId });
  const cabecera = { ...preparado.cabecera, deposito_id: depositoId };

  let recepcionId;
  const tx = db.transaction(() => {
    recepcionId = repo.crearDraft({
      empresaId,
      usuarioId,
      data: {
        ...cabecera,
        uuid,
        usuario_id: usuarioId,
        subtotal: preparado.totales.subtotal,
        iva: preparado.totales.iva,
        total: preparado.totales.total,
        total_documento: preparado.totales.total_documento,
        diferencia_total: preparado.totales.diferencia_total,
        ocr_json: input.ocr ? JSON.stringify(input.ocr) : null,
      },
    });
    repo.reemplazarItems({
      empresaId,
      recepcionId,
      items: preparado.items,
    });
    repo.registrarEvento({
      empresaId,
      recepcionId,
      tipo: "CREACION",
      detalle: { origen: cabecera.origen, items: preparado.items.length },
      usuarioId,
    });
  });
  tx();
  return obtenerRecepcion({ empresaId, id: recepcionId });
}

function actualizar({ empresaId, usuarioId, id, input = {} }) {
  const actual = obtenerRecepcion({ empresaId, id });
  if (actual.estado !== "BORRADOR") {
    throw error("Solo se puede editar una recepción en borrador.", 409);
  }

  const entrada = {
    ...actual,
    ...input,
    items: Array.isArray(input.items)
      ? input.items
      : actual.items.map((item) => ({ ...item })),
  };
  const depositoId = Number(input.deposito_id || actual.deposito_id);
  validarDeposito({ empresaId, depositoId });
  const preparado = preparar({ empresaId, input: entrada, depositoId });
  const cabecera = { ...preparado.cabecera, deposito_id: depositoId };

  const tx = db.transaction(() => {
    repo.actualizarDraft({
      empresaId,
      id,
      data: {
        ...cabecera,
        subtotal: preparado.totales.subtotal,
        iva: preparado.totales.iva,
        total: preparado.totales.total,
        total_documento: preparado.totales.total_documento,
        diferencia_total: preparado.totales.diferencia_total,
        archivo_nombre: input.archivo_nombre || null,
        archivo_mime: input.archivo_mime || null,
        archivo_path: input.archivo_path || null,
        archivo_url: input.archivo_url || null,
        ocr_json: input.ocr ? JSON.stringify(input.ocr) : null,
      },
    });
    repo.reemplazarItems({ empresaId, recepcionId: id, items: preparado.items });
    repo.actualizarTotales({ empresaId, id, totales: preparado.totales });
  });
  tx();
  return obtenerRecepcion({ empresaId, id });
}

function anular({ empresaId, usuarioId, id }) {
  const recepcion = obtenerRecepcion({ empresaId, id });
  if (recepcion.estado !== "BORRADOR") {
    throw error("Solo se puede anular una recepción en borrador.", 409);
  }
  const tx = db.transaction(() => {
    if (!repo.marcarAnulada({ empresaId, id })) {
      throw error("No se pudo anular la recepción.", 409);
    }
    repo.registrarEvento({
      empresaId,
      recepcionId: id,
      tipo: "ANULACION",
      detalle: null,
      usuarioId,
    });
  });
  tx();
  return obtenerRecepcion({ empresaId, id });
}

function detallesIva(items) {
  const grupos = new Map();
  for (const item of items) {
    if (numero(item.cantidad_facturada) <= 0) continue;
    const alicuota = numero(item.iva);
    const base = numero(item.costo_neto) * numero(item.cantidad_facturada) *
      (1 - numero(item.descuento) / 100);
    const grupo = grupos.get(alicuota) || { alicuota, neto: 0, iva: 0, total_con_iva: 0 };
    grupo.neto += base;
    grupo.iva += base * (alicuota / 100);
    grupo.total_con_iva += base * (1 + alicuota / 100);
    grupos.set(alicuota, grupo);
  }
  return [...grupos.values()].map((grupo) => ({
    alicuota: grupo.alicuota,
    neto: redondear(grupo.neto),
    iva: redondear(grupo.iva),
    total_con_iva: redondear(grupo.total_con_iva),
  }));
}

function validarConfirmacion({ empresaId, recepcion, permisos }) {
  if (recepcion.crear_factura) requirePermiso(permisos, "compras.gestionar");
  if (recepcion.actualizar_costo) requirePermiso(permisos, "productos.costos");
  if (recepcion.actualizar_precio) requirePermiso(permisos, "productos.precios");

  validarDeposito({ empresaId, depositoId: recepcion.deposito_id });

  const items = recepcion.items || [];
  const recibidos = items.filter((item) => numero(item.cantidad_recibida) > 0);
  if (!recibidos.length) {
    throw error("No hay cantidades recibidas. Ingresá al menos un renglón.");
  }

  const sinProducto = recibidos.filter((item) => !item.producto_id);
  if (sinProducto.length) {
    throw error(
      `Hay ${sinProducto.length} renglón(es) con cantidad recibida sin producto asignado.`,
      400,
      sinProducto.map((item) => ({
        linea: item.linea,
        descripcion: item.descripcion || item.codigo,
      })),
    );
  }

  const sinCosto = recibidos.filter((item) => numero(item.costo_unitario) <= 0);
  if (
    sinCosto.length &&
    (recepcion.crear_factura || recepcion.actualizar_costo || recepcion.actualizar_precio)
  ) {
    throw error(
      `Hay ${sinCosto.length} renglón(es) recibido(s) sin costo. Completá el costo antes de confirmar.`,
      400,
      sinCosto.map((item) => ({
        linea: item.linea,
        descripcion: item.descripcion || item.codigo,
      })),
    );
  }

  const sinRecibir = items.filter(
    (item) => numero(item.cantidad_facturada) > 0 && numero(item.cantidad_recibida) <= 0,
  );
  if (sinRecibir.length && !recepcion.permitir_parcial) {
    throw error(
      `Hay ${sinRecibir.length} renglón(es) sin recibir. Si la entrega es parcial, activá "Permitir recepción parcial".`,
      400,
      sinRecibir.map((item) => ({
        linea: item.linea,
        descripcion: item.descripcion || item.codigo,
      })),
    );
  }

  if (recepcion.crear_factura) {
    if (!recepcion.proveedor_nombre) throw error("Completá el proveedor para generar la compra.");
    if (!recepcion.tipo_comprobante) throw error("Completá el tipo de comprobante.");
    if (!recepcion.numero) throw error("Completá el número de comprobante.");
    const duplicada = repo.buscarCompraDuplicada({
      empresaId,
      tipoComprobante: recepcion.tipo_comprobante,
      puntoVenta: recepcion.punto_venta || 1,
      numero: recepcion.numero,
    });
    if (duplicada) {
      throw error(
        `Ese comprobante ya está registrado como compra #${duplicada.id}. Revisá el número o desmarcá "Generar factura de compra".`,
        409,
      );
    }
  } else {
    const duplicada = repo.buscarRecepcionConfirmadaDuplicada({
      empresaId,
      tipoComprobante: recepcion.tipo_comprobante,
      puntoVenta: recepcion.punto_venta || 1,
      numero: recepcion.numero,
      excluirId: recepcion.id,
    });
    if (duplicada) {
      throw error(
        `Ya hay una recepción confirmada para ese comprobante (#${duplicada.id}).`,
        409,
      );
    }
  }

  if (
    recepcion.total_documento > 0 &&
    Math.abs(numero(recepcion.diferencia_total)) > 0.1 &&
    !recepcion.permitir_diferencia_total
  ) {
    throw error(
      `El total del documento (${recepcion.total_documento}) no coincide con el calculado (${recepcion.total}). Si es correcto, activá "Permitir diferencia de total".`,
      400,
      {
        total_documento: recepcion.total_documento,
        total_calculado: recepcion.total,
        diferencia: recepcion.diferencia_total,
      },
    );
  }

  return recibidos;
}

function confirmar({ empresaId, usuarioId, id, permisos }) {
  const recepcion = obtenerRecepcion({ empresaId, id });
  if (recepcion.estado === "CONFIRMADA") {
    return {
      idempotente: true,
      recepcion,
      compra_id: recepcion.compra_id,
      movimientos: [],
      actualizaciones: [],
      advertencias: [],
    };
  }
  if (recepcion.estado !== "BORRADOR") {
    throw error("La recepción no está en borrador.", 409);
  }

  const recibidos = validarConfirmacion({ empresaId, recepcion, permisos });
  const totales = {
    subtotal: numero(recepcion.subtotal),
    iva: numero(recepcion.iva),
    total: numero(recepcion.total),
    total_documento: numero(recepcion.total_documento) || numero(recepcion.total),
    diferencia_total: numero(recepcion.diferencia_total),
  };
  const advertencias = [];
  for (const item of recibidos) {
    if (
      numero(item.cantidad_facturada) > 0 &&
      numero(item.cantidad_recibida) > numero(item.cantidad_facturada)
    ) {
      advertencias.push(
        `${item.descripcion || item.codigo}: recibiste ${item.cantidad_recibida} y la factura dice ${item.cantidad_facturada}.`,
      );
    }
  }

  const detalles = detallesIva(recepcion.items);
  const compraEsC = String(recepcion.letra || "").toUpperCase() === "C";
  const compraData = {
    proveedor_nombre: recepcion.proveedor_nombre,
    proveedor_documento: recepcion.proveedor_documento,
    proveedor_domicilio: recepcion.proveedor_domicilio,
    proveedor_condicion_iva: recepcion.proveedor_condicion_iva,
    tipo_comprobante: recepcion.tipo_comprobante,
    letra: recepcion.letra,
    punto_venta: recepcion.punto_venta || 1,
    numero: recepcion.numero,
    fecha: recepcion.fecha,
    fecha_vencimiento: recepcion.fecha_vencimiento,
    condicion_pago: recepcion.condicion_pago,
    moneda: recepcion.moneda,
    cotizacion: recepcion.cotizacion,
    observaciones: recepcion.observaciones,
    neto_gravado: compraEsC ? totales.total : totales.subtotal,
    exento_no_gravado: compraEsC ? 0 : numero(recepcion.exento_no_gravado),
    iva_total: compraEsC ? 0 : totales.iva,
    percepciones: numero(recepcion.percepciones),
    total: totales.total,
    mes_iva: Number(String(recepcion.fecha || "").slice(5, 7)) || 1,
    anio_iva: Number(String(recepcion.fecha || "").slice(0, 4)) || new Date().getFullYear(),
  };

  const resultado = { movimientos: [], actualizaciones: [], compra_id: null };
  const tx = db.transaction(() => {
    if (recepcion.crear_factura) {
      resultado.compra_id = repo.insertarCompra({ empresaId, data: compraData });
      repo.insertarIvaCompra({
        compraId: resultado.compra_id,
        detalles: compraEsC
          ? [{ alicuota: 0, neto: totales.total, iva: 0, total_con_iva: totales.total }]
          : detalles,
      });
    }

    for (const item of recibidos) {
      const cantidad = numero(item.cantidad_recibida);
      if (cantidad <= 0 || !item.producto_id) continue;

      stockRepo.moverStock({
        empresaId,
        depositoId: recepcion.deposito_id,
        productoId: item.producto_id,
        tipo: "ENTRADA",
        cantidad,
        motivo: `Recepción de mercadería ${recepcion.tipo_comprobante || ""} ${recepcion.numero || ""}`.trim(),
        documentoTipo: "RECEPCION_MERCADERIA",
        documentoId: recepcion.id,
        usuarioId,
      });
      resultado.movimientos.push({
        producto_id: item.producto_id,
        cantidad,
        descripcion: item.descripcion,
      });

      const producto = repo.getProducto({ empresaId, productoId: item.producto_id });
      if (!producto) continue;
      const nuevoCosto = numero(item.costo_neto);
      const nuevoPrecio =
        item.precio_venta_nuevo != null && numero(item.precio_venta_nuevo) > 0
          ? numero(item.precio_venta_nuevo)
          : numero(producto.costo) *
            (1 + numero(item.iva) / 100) *
            (1 + numero(recepcion.margen_porcentaje) / 100);
      if (
        (recepcion.actualizar_costo && nuevoCosto > 0) ||
        recepcion.actualizar_precio
      ) {
        const cambio = repo.actualizarProducto({
          empresaId,
          productoId: item.producto_id,
          costo: nuevoCosto > 0 ? nuevoCosto : producto.costo,
          precio: nuevoPrecio,
          utilidad: recepcion.actualizar_precio
            ? numero(recepcion.margen_porcentaje)
            : null,
          actualizarCosto: recepcion.actualizar_costo && nuevoCosto > 0,
          actualizarPrecio: recepcion.actualizar_precio,
        });
        if (cambio) {
          resultado.actualizaciones.push({
            producto_id: item.producto_id,
            descripcion: item.descripcion,
            costo_anterior: cambio.anterior.costo,
            costo_nuevo: cambio.nuevo.costo,
            precio_anterior: cambio.anterior.precio,
            precio_nuevo: cambio.nuevo.precio,
          });
        }
      }

      if (recepcion.proveedor_id && item.codigo_proveedor) {
        repo.upsertMapeoProveedor({
          empresaId,
          productoId: item.producto_id,
          proveedorId: recepcion.proveedor_id,
          codigoProveedor: item.codigo_proveedor,
          costo: nuevoCosto,
        });
      }
    }

    repo.marcarConfirmada({
      empresaId,
      id: recepcion.id,
      compraId: resultado.compra_id,
      totales,
      usuarioId,
    });
    repo.registrarEvento({
      empresaId,
      recepcionId: recepcion.id,
      tipo: "CONFIRMACION",
      detalle: {
        compra_id: resultado.compra_id,
        movimientos: resultado.movimientos.length,
        actualizaciones: resultado.actualizaciones.length,
        total: totales.total,
      },
      usuarioId,
    });
  });

  try {
    tx();
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE constraint failed: compras")) {
      throw error("Ese comprobante ya fue registrado como compra.", 409);
    }
    throw e;
  }

  for (const productoId of [...new Set(resultado.actualizaciones.map((a) => Number(a.producto_id)))]) {
    try {
      syncEmpresas.propagarProducto(empresaId, productoId);
    } catch {}
  }

  return {
    idempotente: false,
    recepcion: obtenerRecepcion({ empresaId, id }),
    compra_id: resultado.compra_id,
    movimientos: resultado.movimientos,
    actualizaciones: resultado.actualizaciones,
    advertencias,
  };
}

module.exports = {
  guardarArchivo,
  limpiarArchivo,
  listar,
  crear,
  actualizar,
  anular,
  confirmar,
  obtenerRecepcion,
  normalizarCabecera,
  normalizarItem,
  preparar,
  redondear,
  ESTADOS,
};
