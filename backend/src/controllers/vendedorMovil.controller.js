const crypto = require("crypto");
const db = require("../db/database");
const { saveDocumento } = require("../repositories/documentoComercial.repository");

function hash(valor) {
  return crypto.createHash("sha256").update(String(valor || "")).digest("hex");
}

function tokenAleatorio() {
  return crypto.randomBytes(32).toString("base64url");
}

function sumarDias(dias) {
  return new Date(Date.now() + Math.max(1, Number(dias) || 365) * 86400000).toISOString();
}

const intentos = new Map();
function permitirIntento(ip) {
  const clave = String(ip || "sin-ip");
  const actual = intentos.get(clave);
  const ahora = Date.now();
  if (!actual || actual.reset < ahora) {
    intentos.set(clave, { cantidad: 1, reset: ahora + 15 * 60 * 1000 });
    return true;
  }
  actual.cantidad += 1;
  return actual.cantidad <= 20;
}

function esHttps(req) {
  return Boolean(req.secure || String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() === "https");
}

function acceso(req, res) {
  if (!permitirIntento(req.ip)) {
    return res.status(429).json({ ok: false, error: "Demasiados intentos. Esperá unos minutos." });
  }
  const codigo = String(req.body?.codigo || "").trim();
  if (!/^\d{6,10}$/.test(codigo)) {
    return res.status(400).json({ ok: false, error: "Ingresá el código de acceso." });
  }

  const fila = db
    .prepare(
      `SELECT c.*,u.nombre usuario_nombre,u.email,u.usuario,u.activo usuario_activo,
              e.nombre empresa_nombre,e.activa empresa_activa
       FROM vendedor_codigos c
       JOIN usuarios u ON u.id=c.usuario_id
       JOIN empresas e ON e.id=c.empresa_id
       WHERE c.codigo_hash=? AND c.usado_en IS NULL AND c.expira_en > ?`,
    )
    .get(hash(codigo), new Date().toISOString());

  if (!fila) {
    return res.status(401).json({ ok: false, error: "El código no es válido, ya fue usado o venció." });
  }
  if (!fila.usuario_activo || !fila.empresa_activa) {
    return res.status(401).json({ ok: false, error: "Usuario o empresa inactivos." });
  }
  const pertenece = db
    .prepare("SELECT 1 FROM usuario_empresas WHERE usuario_id=? AND empresa_id=? AND activo=1")
    .get(fila.usuario_id, fila.empresa_id);
  if (!pertenece) {
    return res.status(403).json({ ok: false, error: "El usuario ya no pertenece a la empresa." });
  }

  const vendedor = db
    .prepare("SELECT id,nombre FROM vendedores WHERE empresa_id=? AND usuario_id=? AND activo=1")
    .get(fila.empresa_id, fila.usuario_id);
  if (!vendedor) {
    return res.status(403).json({ ok: false, error: "El usuario no está vinculado a un vendedor activo." });
  }

  const token = tokenAleatorio();
  const dias = Number(process.env.VENDEDOR_TOKEN_DIAS || 365);
  const expiraEn = sumarDias(dias);
  const guardar = db.transaction(() => {
    db.prepare("UPDATE vendedor_codigos SET usado_en=? WHERE id=?").run(new Date().toISOString(), fila.id);
    db.prepare(
      "INSERT INTO vendedor_tokens(empresa_id,usuario_id,token_hash,creado_en,expira_en) VALUES(?,?,?,?,?)",
    ).run(fila.empresa_id, fila.usuario_id, hash(token), new Date().toISOString(), expiraEn);
  });
  guardar();

  res.cookie("pixe_vendedor", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: esHttps(req),
    maxAge: Math.max(1, dias) * 86400000,
    path: "/api/v1/vendedor",
  });

  res.json({
    ok: true,
    token,
    expiraEn,
    usuario: { id: fila.usuario_id, nombre: fila.usuario_nombre, email: fila.email || fila.usuario || null },
    empresa: { id: fila.empresa_id, nombre: fila.empresa_nombre },
    vendedor,
  });
}

function salir(req, res) {
  res.clearCookie("pixe_vendedor", { path: "/api/v1/vendedor" });
  res.json({ ok: true });
}

function bootstrap(req, res) {
  const e = req.empresa.id;
  const vendedor = req.vendedor;

  const clientes = db
    .prepare(
      `SELECT c.id,c.razon_social,c.cuit,c.dni,c.domicilio,c.localidad,c.provincia,c.telefono,c.email
       FROM vendedor_clientes vc
       JOIN clientes c ON c.id=vc.cliente_id
       WHERE vc.empresa_id=? AND vc.vendedor_id=? AND vc.activo=1
       ORDER BY c.razon_social`,
    )
    .all(e, vendedor.id);

  const saldos = db
    .prepare(
      `SELECT cliente_doc,SUM(debe)-SUM(haber) saldo
       FROM cliente_cc_movimientos WHERE empresa_id=? GROUP BY cliente_doc`,
    )
    .all(e);
  const porDocumento = new Map(saldos.map((s) => [String(s.cliente_doc || ""), Number(s.saldo || 0)]));
  const clientesConSaldo = clientes.map((c) => ({
    ...c,
    saldo: porDocumento.get(String(c.cuit || c.dni || c.id)) || 0,
  }));

  const productos = db
    .prepare(
      `SELECT p.id,p.codigo,p.codigo_barra codigoBarra,p.descripcion,p.precio,p.iva,p.unidad,
              p.rubro_id rubroId,
              (SELECT COALESCE(SUM(sp.cantidad),0) FROM stock_productos sp WHERE sp.empresa_id=p.empresa_id AND sp.producto_id=p.id) stock
       FROM productos p
       WHERE p.empresa_id=? AND p.activo=1
       ORDER BY p.descripcion
       LIMIT 5000`,
    )
    .all(e);

  res.json({
    ok: true,
    vendedor,
    empresa: { id: e, nombre: req.empresa.nombre },
    clientes: clientesConSaldo,
    productos,
  });
}

function puntoVentaDe(empresaId, usuarioId) {
  const asignado = db
    .prepare(
      `SELECT p.numero FROM usuario_puntos_venta up
       JOIN puntos_venta p ON p.id=up.punto_venta_id AND p.empresa_id=up.empresa_id
       WHERE up.empresa_id=? AND up.usuario_id=? AND p.activo=1
       ORDER BY up.predeterminado DESC,p.numero LIMIT 1`,
    )
    .get(empresaId, usuarioId);
  return Number(asignado?.numero) || Number(
    db.prepare("SELECT numero FROM puntos_venta WHERE empresa_id=? AND activo=1 ORDER BY numero LIMIT 1").get(empresaId)?.numero,
  ) || 1;
}

function crearPresupuesto(req, res) {
  const e = req.empresa.id;
  const vendedor = req.vendedor;
  const clienteId = Number(req.body?.cliente_id);
  const observaciones = String(req.body?.observaciones || "").trim().slice(0, 500);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ ok: false, error: "Seleccioná un cliente de tu cartera." });
  }
  const cliente = db
    .prepare(
      `SELECT c.id FROM vendedor_clientes vc JOIN clientes c ON c.id=vc.cliente_id
       WHERE vc.empresa_id=? AND vc.vendedor_id=? AND vc.cliente_id=? AND vc.activo=1`,
    )
    .get(e, vendedor.id, clienteId);
  if (!cliente) {
    return res.status(403).json({ ok: false, error: "Ese cliente no está en tu cartera." });
  }
  if (!items.length) return res.status(400).json({ ok: false, error: "Agregá al menos un producto." });
  if (items.length > 100) return res.status(400).json({ ok: false, error: "Máximo 100 productos por presupuesto." });

  const agrupados = new Map();
  for (const item of items) {
    const productoId = Number(item?.producto_id || item?.id);
    const cantidad = Number(item?.cantidad);
    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({ ok: false, error: "Producto inválido." });
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 9999) {
      return res.status(400).json({ ok: false, error: "Cantidad inválida." });
    }
    agrupados.set(productoId, Math.round(((agrupados.get(productoId) || 0) + cantidad) * 1000) / 1000);
  }

  const buscarProducto = db.prepare(
    "SELECT id,codigo,descripcion,precio,iva,unidad FROM productos WHERE id=? AND empresa_id=? AND activo=1",
  );
  const lineas = [];
  for (const [productoId, cantidad] of agrupados) {
    const producto = buscarProducto.get(productoId, e);
    if (!producto) return res.status(400).json({ ok: false, error: `El producto ${productoId} ya no está disponible.` });
    const precioFinal = Number(producto.precio || 0);
    if (precioFinal <= 0) return res.status(400).json({ ok: false, error: `El producto ${producto.descripcion} no tiene precio.` });
    const iva = Number(producto.iva || 0);
    const precioNeto = precioFinal / (1 + iva / 100);
    lineas.push({
      producto_id: producto.id,
      codigo: producto.codigo,
      descripcion: producto.descripcion,
      unidad: producto.unidad || "UN",
      cantidad,
      precioUnitario: precioNeto,
      descuento: 0,
      iva,
    });
  }

  try {
    const documento = saveDocumento({
      empresaId: e,
      clienteId,
      vendedorId: vendedor.id,
      tipo: "PRESUPUESTO",
      estado: "BORRADOR",
      items: lineas,
      observaciones: observaciones || null,
      puntoVenta: puntoVentaDe(e, req.usuario.id),
      condicionVenta: "CONTADO",
      listaPrecio: "GENERAL",
      canal: "MOVIL",
    });
    res.status(201).json({ ok: true, documento });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error.message || "No se pudo crear el presupuesto." });
  }
}

function listarPresupuestos(req, res) {
  const e = req.empresa.id;
  const filas = db
    .prepare(
      `SELECT d.id,d.tipo,d.estado,d.punto_venta,d.numero,d.fecha,d.importe_total,d.condicion_venta,
              COALESCE(c.razon_social,'CONSUMIDOR FINAL') cliente,
              (SELECT COUNT(*) FROM documento_items i WHERE i.documento_id=d.id) items_count
       FROM documentos_comerciales d
       LEFT JOIN clientes c ON c.id=d.cliente_id
       WHERE d.empresa_id=? AND d.vendedor_id=? AND d.tipo='PRESUPUESTO'
       ORDER BY d.id DESC LIMIT 50`,
    )
    .all(e, req.vendedor.id);
  res.json({ ok: true, presupuestos: filas });
}

function detallePresupuesto(req, res) {
  const e = req.empresa.id;
  const id = Number(req.params.id);
  const documento = db
    .prepare(
      `SELECT d.*,COALESCE(c.razon_social,'CONSUMIDOR FINAL') cliente
       FROM documentos_comerciales d LEFT JOIN clientes c ON c.id=d.cliente_id
       WHERE d.id=? AND d.empresa_id=? AND d.vendedor_id=? AND d.tipo='PRESUPUESTO'`,
    )
    .get(id, e, req.vendedor.id);
  if (!documento) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado." });
  documento.items = db
    .prepare("SELECT producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total FROM documento_items WHERE documento_id=? ORDER BY id")
    .all(id);
  res.json({ ok: true, documento });
}

module.exports = {
  acceso,
  salir,
  bootstrap,
  crearPresupuesto,
  listarPresupuestos,
  detallePresupuesto,
};
