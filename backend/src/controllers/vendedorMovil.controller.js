const db = require("../db/database");
const AuthService = require("../services/auth.service");
const { saveDocumento } = require("../repositories/documentoComercial.repository");
const { COOKIE_VENDEDOR, leerRefreshToken } = require("../utils/vendedorCookie");

const DIAS_SESION = Math.max(1, Number(process.env.VENDEDOR_SESION_DIAS || 3650));

function esHttps(req) {
  return Boolean(req.secure || String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() === "https");
}

function ponerCookieSesion(req, res, refreshToken) {
  res.cookie(COOKIE_VENDEDOR, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: esHttps(req),
    maxAge: DIAS_SESION * 86400000,
    path: "/api/v1/vendedor",
  });
}

function borrarCookieSesion(res) {
  res.clearCookie(COOKIE_VENDEDOR, { path: "/api/v1/vendedor" });
}

function vendedorDe(empresaId, usuarioId) {
  return db
    .prepare("SELECT id,nombre FROM vendedores WHERE empresa_id=? AND usuario_id=? AND activo=1")
    .get(empresaId, usuarioId);
}

function login(req, res) {
  const usuario = String(req.body?.usuario || req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  if (!usuario || !password) {
    return res.status(400).json({ ok: false, error: "Ingresá usuario/email y contraseña." });
  }

  let resultado;
  try {
    resultado = AuthService.login({
      email: usuario,
      password,
      empresaId: req.body?.empresaId || undefined,
      empresaNombre: req.body?.empresa || undefined,
      refreshDays: DIAS_SESION,
    });
  } catch (error) {
    return res.status(error.statusCode || 401).json({ ok: false, error: error.message });
  }

  if (resultado.requiereEmpresa) {
    return res.json({ ok: true, requiereEmpresa: true, empresas: resultado.empresas });
  }

  const vendedor = vendedorDe(resultado.empresa.id, resultado.usuario.id);
  if (!vendedor) {
    try {
      AuthService.logout({ refreshToken: resultado.refreshToken });
    } catch {}
    return res.status(403).json({ ok: false, error: "Tu usuario no está vinculado a un vendedor activo. Pedile al administrador que lo asocie." });
  }

  ponerCookieSesion(req, res, resultado.refreshToken);
  res.json({
    ok: true,
    token: resultado.token,
    usuario: resultado.usuario,
    empresa: resultado.empresa,
    vendedor,
  });
}

function refresh(req, res) {
  const refreshToken = leerRefreshToken(req);
  if (!refreshToken) {
    borrarCookieSesion(res);
    return res.status(401).json({ ok: false, error: "No hay una sesión guardada." });
  }

  let resultado;
  try {
    resultado = AuthService.refresh({ refreshToken, refreshDays: DIAS_SESION });
  } catch (error) {
    borrarCookieSesion(res);
    return res.status(401).json({ ok: false, error: "Sesión revocada o vencida. Iniciá sesión de nuevo." });
  }

  const vendedor = vendedorDe(resultado.empresa.id, resultado.usuario.id);
  if (!vendedor) {
    borrarCookieSesion(res);
    return res.status(403).json({ ok: false, error: "Tu usuario ya no está vinculado a un vendedor activo." });
  }

  ponerCookieSesion(req, res, refreshToken);
  res.json({
    ok: true,
    token: resultado.token,
    usuario: resultado.usuario,
    empresa: resultado.empresa,
    vendedor,
  });
}

function salir(req, res) {
  const refreshToken = leerRefreshToken(req);
  if (refreshToken) {
    try {
      AuthService.logout({ refreshToken });
    } catch {}
  }
  borrarCookieSesion(res);
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
  const observaciones = String(req.body?.observaciones || "").trim().slice(0, 500);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  let clienteId = Number(req.body?.cliente_id) || null;
  const clienteNombre = String(req.body?.cliente_nombre || "").trim().slice(0, 150);

  if (clienteId) {
    const clienteEmpresa = db.prepare("SELECT id FROM clientes WHERE id=? AND empresa_id=?").get(clienteId, e);
    if (!clienteEmpresa) {
      return res.status(404).json({ ok: false, error: "El cliente no pertenece a la empresa." });
    }
  } else if (clienteNombre) {
    const existente = db
      .prepare("SELECT id FROM clientes WHERE empresa_id=? AND LOWER(TRIM(razon_social))=LOWER(?) ORDER BY id LIMIT 1")
      .get(e, clienteNombre);
    if (existente) {
      clienteId = Number(existente.id);
    } else {
      const info = db
        .prepare(
          `INSERT INTO clientes(empresa_id,razon_social,condicion_iva,cliente_pedidos,descuento_porcentaje)
           VALUES(?,?,'CONSUMIDOR FINAL',1,0)`,
        )
        .run(e, clienteNombre);
      clienteId = Number(info.lastInsertRowid);
    }
  } else {
    return res.status(400).json({ ok: false, error: "Seleccioná un cliente o escribí su nombre." });
  }

  if (!items.length) return res.status(400).json({ ok: false, error: "Agregá al menos un producto o artículo manual." });
  if (items.length > 100) return res.status(400).json({ ok: false, error: "Máximo 100 artículos por presupuesto." });

  const agrupados = new Map();
  const manuales = [];
  for (const item of items) {
    const cantidad = Number(item?.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 9999) {
      return res.status(400).json({ ok: false, error: "Cantidad inválida." });
    }
    if (item?.manual) {
      const descripcion = String(item.descripcion || "").trim().slice(0, 200);
      const precio = Number(item.precio || item.precio_unitario || 0);
      const iva = Number(item.iva || 0);
      if (!descripcion) return res.status(400).json({ ok: false, error: "La descripción del artículo manual es obligatoria." });
      if (!Number.isFinite(precio) || precio <= 0) {
        return res.status(400).json({ ok: false, error: `Ingresá un precio para "${descripcion}".` });
      }
      if (![0, 2.5, 5, 10.5, 21, 27].includes(iva)) {
        return res.status(400).json({ ok: false, error: "IVA inválido en el artículo manual." });
      }
      manuales.push({
        producto_id: null,
        codigo: String(item.codigo || "MANUAL").trim().slice(0, 100) || "MANUAL",
        descripcion,
        unidad: "UN",
        cantidad,
        precioUnitario: precio / (1 + iva / 100),
        descuento: 0,
        iva,
      });
      continue;
    }
    const productoId = Number(item?.producto_id || item?.id);
    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({ ok: false, error: "Producto inválido." });
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
    lineas.push({
      producto_id: producto.id,
      codigo: producto.codigo,
      descripcion: producto.descripcion,
      unidad: producto.unidad || "UN",
      cantidad,
      precioUnitario: precioFinal / (1 + iva / 100),
      descuento: 0,
      iva,
    });
  }
  lineas.push(...manuales);

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
  login,
  refresh,
  salir,
  bootstrap,
  crearPresupuesto,
  listarPresupuestos,
  detallePresupuesto,
};
