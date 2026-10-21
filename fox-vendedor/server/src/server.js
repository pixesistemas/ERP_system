const path = require("path");
const crypto = require("crypto");
const express = require("express");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
  db,
  ahora,
  crearCodigo,
  canjearCodigo,
  verificarToken,
  registrarSync,
} = require("./db");

const PUERTO = Number(process.env.PORT || 3100);
const SYNC_KEY = String(process.env.SYNC_KEY || "cambiar-esta-clave-por-una-larga");
const TOKEN_DIAS = Number(process.env.TOKEN_DIAS || 365);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "30mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

const intentos = new Map();
function permitirIntento(ip) {
  const clave = String(ip || "sin-ip");
  const actual = intentos.get(clave);
  const ahoraMs = Date.now();
  if (!actual || actual.reset < ahoraMs) {
    intentos.set(clave, { cantidad: 1, reset: ahoraMs + 15 * 60 * 1000 });
    return true;
  }
  actual.cantidad += 1;
  return actual.cantidad <= 15;
}

function redondear(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function texto(valor, max = 200) {
  return String(valor == null ? "" : valor).trim().slice(0, max);
}

function precioDe(articulo, lista) {
  const precios = [
    Number(articulo.pfinal1 || 0),
    Number(articulo.pfinal2 || 0),
    Number(articulo.pfinal3 || 0),
    Number(articulo.pfinal4 || 0),
  ];
  const elegido = precios[lista - 1] || 0;
  return elegido > 0 ? elegido : precios[0] || 0;
}

function articuloPublico(articulo, lista) {
  return {
    idart: Number(articulo.idart),
    codigo: articulo.codigo,
    codbarra: articulo.codbarra,
    descripcion: articulo.descripcion,
    detalle: articulo.detalle,
    unidad: articulo.unidad,
    stock: Number(articulo.stock || 0),
    iva: Number(articulo.iva || 0),
    precio: precioDe(articulo, lista),
    precios: [
      Number(articulo.pfinal1 || 0),
      Number(articulo.pfinal2 || 0),
      Number(articulo.pfinal3 || 0),
      Number(articulo.pfinal4 || 0),
    ],
    actualizado: articulo.actualizado_fox,
  };
}

function autenticar(req, res, next) {
  const header = String(req.get("authorization") || "");
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const datos = verificarToken(token);
  if (!datos) {
    return res.status(401).json({ ok: false, error: "Token inválido o vencido. Pedí un código nuevo." });
  }
  req.tokenData = datos;
  next();
}

function autenticarSync(req, res, next) {
  const recibida = String(req.get("x-sync-key") || "");
  const esperada = SYNC_KEY;
  const ok =
    recibida.length === esperada.length &&
    recibida.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada));
  if (!ok) return res.status(401).json({ ok: false, error: "Clave de sincronización inválida." });
  next();
}

app.get("/api/salud", (req, res) => {
  res.json({ ok: true, hora: ahora(), version: "1.0.0" });
});

app.post("/api/acceso", (req, res) => {
  if (!permitirIntento(req.ip)) {
    return res.status(429).json({ ok: false, error: "Demasiados intentos. Esperá unos minutos." });
  }
  const codigo = texto(req.body?.codigo, 20);
  if (!/^\d{6,10}$/.test(codigo)) {
    return res.status(400).json({ ok: false, error: "Ingresá el código de acceso." });
  }
  const resultado = canjearCodigo(codigo, "", TOKEN_DIAS);
  if (!resultado) {
    return res.status(401).json({ ok: false, error: "El código no es válido, ya fue usado o venció." });
  }
  res.json({
    ok: true,
    token: resultado.token,
    expiraEn: resultado.expiraEn,
    nombre: resultado.nombre || "Vendedor",
  });
});

app.get("/api/perfil", autenticar, (req, res) => {
  res.json({ ok: true, vendedor: req.tokenData.nombre, expiraEn: req.tokenData.expiraEn });
});

app.get("/api/articulos", autenticar, (req, res) => {
  const q = texto(req.query.q, 80);
  if (!q) return res.json({ ok: true, articulos: [] });
  const lista = Math.min(4, Math.max(1, Number(req.query.lista) || 1));
  const patron = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const filas = db
    .prepare(
      `SELECT * FROM articulos
       WHERE descripcion LIKE ? ESCAPE '\\'
          OR codigo LIKE ? ESCAPE '\\'
          OR codbarra LIKE ? ESCAPE '\\'
          OR detalle LIKE ? ESCAPE '\\'
       ORDER BY CASE WHEN codigo = ? OR codbarra = ? THEN 0 ELSE 1 END, descripcion COLLATE NOCASE
       LIMIT 60`,
    )
    .all(patron, patron, patron, patron, q, q);
  res.json({ ok: true, lista, articulos: filas.map((a) => articuloPublico(a, lista)) });
});

app.post("/api/presupuestos", autenticar, (req, res) => {
  const lista = Math.min(4, Math.max(1, Number(req.body?.lista) || 1));
  const cliente = texto(req.body?.cliente, 150) || "CONSUMIDOR FINAL";
  const observaciones = texto(req.body?.observaciones, 500);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ ok: false, error: "Agregá al menos un artículo." });
  if (items.length > 100) return res.status(400).json({ ok: false, error: "Máximo 100 artículos por presupuesto." });

  const agrupados = new Map();
  for (const item of items) {
    const idart = Number(item?.idart);
    const cantidad = Number(item?.cantidad);
    if (!Number.isInteger(idart) || idart <= 0) {
      return res.status(400).json({ ok: false, error: "Artículo inválido." });
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 9999) {
      return res.status(400).json({ ok: false, error: "Cantidad inválida." });
    }
    agrupados.set(idart, redondear((agrupados.get(idart) || 0) + cantidad));
  }

  const buscar = db.prepare("SELECT * FROM articulos WHERE idart=?");
  const lineas = [];
  let subtotal = 0;
  let ivaTotal = 0;
  let total = 0;
  for (const [idart, cantidad] of agrupados) {
    const articulo = buscar.get(idart);
    if (!articulo) return res.status(400).json({ ok: false, error: `El artículo ${idart} ya no existe en la lista.` });
    const precio = precioDe(articulo, lista);
    if (precio <= 0) return res.status(400).json({ ok: false, error: `El artículo ${articulo.descripcion} no tiene precio.` });
    const bruto = redondear(precio * cantidad);
    const neto = redondear(bruto / (1 + Number(articulo.iva || 0) / 100));
    const ivaImporte = redondear(bruto - neto);
    subtotal = redondear(subtotal + neto);
    ivaTotal = redondear(ivaTotal + ivaImporte);
    total = redondear(total + bruto);
    lineas.push({
      idart,
      codigo: articulo.codigo,
      descripcion: articulo.descripcion,
      cantidad,
      puni: precio,
      descuento: 0,
      iva: Number(articulo.iva || 0),
      neto,
      ivaImporte,
      total: bruto,
      idrubro: Number(articulo.idrubro || 0),
      unidad: articulo.unidad,
    });
  }

  const insertar = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO presupuestos(token_id,vendedor,cliente,observaciones,lista_precio,subtotal,iva,total,estado,creado_en)
         VALUES(?,?,?,?,?,?,?,?,'PENDIENTE',?)`,
      )
      .run(req.tokenData.id, req.tokenData.nombre, cliente, observaciones, lista, subtotal, ivaTotal, total, ahora());
    const insItem = db.prepare(
      `INSERT INTO presupuesto_items(presupuesto_id,idart,codigo,descripcion,cantidad,puni,descuento,iva,neto,iva_importe,total,idrubro,unidad)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const linea of lineas) {
      insItem.run(info.lastInsertRowid, linea.idart, linea.codigo, linea.descripcion, linea.cantidad, linea.puni, 0, linea.iva, linea.neto, linea.ivaImporte, linea.total, linea.idrubro, linea.unidad);
    }
    return Number(info.lastInsertRowid);
  });

  const id = insertar();
  res.status(201).json({
    ok: true,
    presupuesto: {
      id,
      numeroLocal: `WEB-${String(id).padStart(6, "0")}`,
      vendedor: req.tokenData.nombre,
      cliente,
      observaciones,
      lista,
      subtotal,
      iva: ivaTotal,
      total,
      estado: "PENDIENTE",
      items: lineas,
      creadoEn: ahora(),
    },
  });
});

app.get("/api/presupuestos", autenticar, (req, res) => {
  const filas = db
    .prepare(
      `SELECT p.*,(SELECT COUNT(*) FROM presupuesto_items i WHERE i.presupuesto_id=p.id) items_count
       FROM presupuestos p WHERE p.token_id=? ORDER BY p.id DESC LIMIT 50`,
    )
    .all(req.tokenData.id);
  res.json({ ok: true, presupuestos: filas });
});

app.get("/api/presupuestos/:id", autenticar, (req, res) => {
  const id = Number(req.params.id);
  const fila = db
    .prepare("SELECT * FROM presupuestos WHERE id=? AND token_id=?")
    .get(id, req.tokenData.id);
  if (!fila) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado." });
  const items = db.prepare("SELECT * FROM presupuesto_items WHERE presupuesto_id=? ORDER BY id").all(id);
  res.json({ ok: true, presupuesto: { ...fila, items } });
});

app.post("/api/sync/catalogo", autenticarSync, (req, res) => {
  const articulos = Array.isArray(req.body?.articulos) ? req.body.articulos : null;
  const reemplazar = Boolean(req.body?.reemplazar);
  if (!articulos) return res.status(400).json({ ok: false, error: "Falta la lista de artículos." });
  if (articulos.length > 50000) return res.status(400).json({ ok: false, error: "Demasiados artículos en una sincronización." });

  const normalizados = [];
  for (const item of articulos) {
    const idart = Number(item?.idart);
    if (!Number.isInteger(idart) || idart <= 0) continue;
    const descripcion = texto(item.descripcion, 300);
    if (!descripcion) continue;
    normalizados.push({
      idart,
      codigo: texto(item.codigo, 100),
      codbarra: texto(item.codbarra, 150),
      descripcion,
      detalle: texto(item.detalle, 200),
      unidad: texto(item.unidad, 100),
      stock: Number(item.stock || 0),
      iva: Number(item.iva || 0),
      pfinal1: Number(item.pfinal1 || 0),
      pfinal2: Number(item.pfinal2 || 0),
      pfinal3: Number(item.pfinal3 || 0),
      pfinal4: Number(item.pfinal4 || 0),
      idrubro: Number(item.idrubro || 0),
      idmarca: Number(item.idmarca || 0),
      actualizado_fox: texto(item.actualizado_fox, 20),
    });
  }

  const guardar = db.transaction(() => {
    if (reemplazar) db.prepare("DELETE FROM articulos").run();
    const upsert = db.prepare(
      `INSERT INTO articulos(idart,codigo,codbarra,descripcion,detalle,unidad,stock,iva,pfinal1,pfinal2,pfinal3,pfinal4,idrubro,idmarca,actualizado_fox,actualizado_en)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(idart) DO UPDATE SET
         codigo=excluded.codigo, codbarra=excluded.codbarra, descripcion=excluded.descripcion,
         detalle=excluded.detalle, unidad=excluded.unidad, stock=excluded.stock, iva=excluded.iva,
         pfinal1=excluded.pfinal1, pfinal2=excluded.pfinal2, pfinal3=excluded.pfinal3, pfinal4=excluded.pfinal4,
         idrubro=excluded.idrubro, idmarca=excluded.idmarca, actualizado_fox=excluded.actualizado_fox,
         actualizado_en=excluded.actualizado_en`,
    );
    const fecha = ahora();
    for (const a of normalizados) {
      upsert.run(a.idart, a.codigo, a.codbarra, a.descripcion, a.detalle, a.unidad, a.stock, a.iva, a.pfinal1, a.pfinal2, a.pfinal3, a.pfinal4, a.idrubro, a.idmarca, a.actualizado_fox, fecha);
    }
  });
  guardar();
  registrarSync("CATALOGO", `${normalizados.length} artículos${reemplazar ? " (reemplazo)" : ""}`);
  res.json({ ok: true, articulos: normalizados.length, reemplazar });
});

app.post("/api/sync/codigo", autenticarSync, (req, res) => {
  const nombre = texto(req.body?.nombre, 120);
  const dias = Math.max(1, Math.min(30, Number(req.body?.dias) || 1));
  const resultado = crearCodigo(nombre, dias);
  registrarSync("CODIGO", `Código para ${nombre || "vendedor"} (${dias} día/s)`);
  res.json({ ok: true, ...resultado });
});

app.get("/api/sync/pendientes", autenticarSync, (req, res) => {
  const pendientes = db
    .prepare("SELECT * FROM presupuestos WHERE estado='PENDIENTE' ORDER BY id LIMIT 100")
    .all();
  const items = db.prepare("SELECT * FROM presupuesto_items WHERE presupuesto_id=? ORDER BY id");
  res.json({
    ok: true,
    presupuestos: pendientes.map((p) => ({ ...p, items: items.all(p.id) })),
  });
});

app.post("/api/sync/presupuestos/:id/confirmado", autenticarSync, (req, res) => {
  const id = Number(req.params.id);
  const idcompro = Number(req.body?.idcompro);
  const numero = Number(req.body?.numero);
  if (!Number.isInteger(idcompro) || idcompro <= 0) {
    return res.status(400).json({ ok: false, error: "Falta idcompro de FoxPro." });
  }
  const resultado = db
    .prepare(
      `UPDATE presupuestos SET estado='SINCRONIZADO',fox_idcompro=?,fox_numero=?,sincronizado_en=?,error_sync=NULL
       WHERE id=? AND estado='PENDIENTE'`,
    )
    .run(idcompro, Number.isInteger(numero) ? numero : null, ahora(), id);
  if (!resultado.changes) return res.status(404).json({ ok: false, error: "Presupuesto pendiente no encontrado." });
  registrarSync("PRESUPUESTO", `#${id} -> compro ${idcompro}/${numero || "-"}`);
  res.json({ ok: true });
});

app.post("/api/sync/presupuestos/:id/error", autenticarSync, (req, res) => {
  const id = Number(req.params.id);
  const error = texto(req.body?.error, 500) || "Error de sincronización.";
  const resultado = db
    .prepare("UPDATE presupuestos SET estado='ERROR',error_sync=? WHERE id=? AND estado='PENDIENTE'")
    .run(error, id);
  if (!resultado.changes) return res.status(404).json({ ok: false, error: "Presupuesto pendiente no encontrado." });
  registrarSync("ERROR", `#${id}: ${error}`);
  res.json({ ok: true });
});

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir, { maxAge: "1h" }));

app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada." });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, req, res, next) => {
  console.error("[fox-vendedor]", error);
  if (res.headersSent) return next(error);
  res.status(500).json({ ok: false, error: "Error interno del servidor." });
});

if (require.main === module) {
  app.listen(PUERTO, () => {
    console.log(`Fox Vendedor escuchando en http://localhost:${PUERTO}`);
    if (SYNC_KEY.startsWith("cambiar-esta-clave")) {
      console.warn("ATENCIÓN: cambiá SYNC_KEY en server/.env antes de publicar la app.");
    }
  });
}

module.exports = { app, PUERTO };
