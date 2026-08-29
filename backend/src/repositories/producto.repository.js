const db = require("../db/database");

function mapProducto(row) {
  if (!row) return null;

  return {
    id: row.id,
    codigo: row.codigo,
    codigoBarra: row.codigo_barra,
    descripcion: row.descripcion,
    precio: row.precio,
    iva: row.iva,
    unidad: row.unidad,
    activo: row.activo === 1,
    costo: Number(row.costo || 0), utilidad: Number(row.utilidad || 0), rubroId: row.rubro_id, subrubroId: row.subrubro_id, marcaId: row.marca_id, unidadId: row.unidad_id, updatedAt: row.updated_at,
  };
}

function getProductoByCodigo(codigo) {
  const row = db
    .prepare("SELECT * FROM productos WHERE codigo = ? AND activo = 1")
    .get(String(codigo));

  return mapProducto(row);
}

function getProductoByCodigoBarra(codigoBarra) {
  const row = db
    .prepare("SELECT * FROM productos WHERE codigo_barra = ? AND activo = 1")
    .get(String(codigoBarra));

  return mapProducto(row);
}

function buscarProducto(texto) {
  const like = `%${String(texto).trim()}%`;

  const row = db
    .prepare(
      `
      SELECT *
      FROM productos
      WHERE activo = 1
        AND descripcion LIKE ?
      ORDER BY descripcion
      LIMIT 1
    `,
    )
    .get(like);

  return mapProducto(row);
}

function buscarProductos({ empresaId, texto, limit = 10 }) {
  const busqueda = `%${String(texto || "").trim()}%`;

  return db
    .prepare(
      `
    SELECT *
    FROM productos
    WHERE empresa_id = ?
      AND activo = 1
      AND (
        codigo LIKE ?
        OR codigo_barra LIKE ?
        OR descripcion LIKE ?
      )
    ORDER BY
      CASE
        WHEN codigo = ? THEN 0
        WHEN codigo_barra = ? THEN 0
        ELSE 1
      END,
      descripcion
    LIMIT ?
  `,
    )
    .all(
      empresaId,
      busqueda,
      busqueda,
      busqueda,
      String(texto || ""),
      String(texto || ""),
      Number(limit),
    );
}

function saveProducto(producto) {
  db.prepare(
    `
    INSERT INTO productos (
      codigo, codigo_barra, descripcion, precio, iva, unidad, activo, updated_at
    )
    VALUES (
      @codigo, @codigo_barra, @descripcion, @precio, @iva, @unidad, 1, CURRENT_TIMESTAMP
    )
    ON CONFLICT(codigo) DO UPDATE SET
      codigo_barra = excluded.codigo_barra,
      descripcion = excluded.descripcion,
      precio = excluded.precio,
      iva = excluded.iva,
      unidad = excluded.unidad,
      activo = 1,
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run({
    codigo: producto.codigo || null,
    codigo_barra: producto.codigoBarra || null,
    descripcion: producto.descripcion,
    precio: Number(producto.precio || 0),
    iva: Number(producto.iva ?? 21),
    unidad: producto.unidad || "UN",
  });

  return getProductoByCodigo(producto.codigo);
}

// Busca un producto por su identificador interno.
function getProductoById(id) {
  return db
    .prepare(
      `
    SELECT *
    FROM productos
    WHERE id = ?
      AND activo = 1
  `,
    )
    .get(id);
}

module.exports = {
  getProductoByCodigo,
  getProductoByCodigoBarra,
  buscarProducto,
  saveProducto,
  buscarProductos,
  getProductoById,
};

function normalizeData(data = {}) {
  const descripcion = String(data.descripcion || '').trim();
  if (!descripcion) { const e = new Error('La descripción es obligatoria.'); e.statusCode = 400; throw e; }
  const precio = Number(data.precio);
  if (!Number.isFinite(precio) || precio < 0) { const e = new Error('El precio debe ser un número válido.'); e.statusCode = 400; throw e; }
  return {
    codigo: String(data.codigo || '').trim() || null,
    codigo_barra: String(data.codigoBarra || data.codigo_barra || '').trim() || null,
    descripcion,
    precio,
    iva: Number(data.iva ?? 21),
    unidad: String(data.unidad || 'UN').trim().toUpperCase(),
    activo: data.activo === false ? 0 : 1, costo: Number(data.costo || 0), utilidad: Number(data.utilidad || 0), rubro_id: data.rubroId || data.rubro_id || null, subrubro_id: data.subrubroId || data.subrubro_id || null, marca_id: data.marcaId || data.marca_id || null, unidad_id: data.unidadId || data.unidad_id || null, proveedores: Array.isArray(data.proveedores) ? data.proveedores : [], codigosBarras: Array.isArray(data.codigosBarras) ? data.codigosBarras : [],
  };
}

function conCodigosBarras(producto, empresaId) {
  if (!producto) return producto;
  return { ...producto, codigosBarras: listarCodigosBarras({ empresaId, productoId: producto.id }) };
}

function listarProductos({ empresaId, texto = '', includeInactive = false }) {
  const q = `%${String(texto).trim()}%`;
  return db.prepare(`SELECT * FROM productos WHERE empresa_id = ? ${includeInactive ? '' : 'AND activo = 1'} AND (descripcion LIKE ? OR codigo LIKE ? OR codigo_barra LIKE ?) ORDER BY descripcion`).all(empresaId, q, q, q).map((r) => conCodigosBarras(mapProducto(r), empresaId));
}
function obtenerProducto({ id, empresaId }) { return conCodigosBarras(mapProducto(db.prepare('SELECT * FROM productos WHERE id = ? AND empresa_id = ?').get(id, empresaId)), empresaId); }
function saveSuppliers({empresaId, productoId, proveedores}){db.prepare('DELETE FROM producto_proveedores WHERE empresa_id=? AND producto_id=?').run(empresaId,productoId);const ins=db.prepare('INSERT INTO producto_proveedores(empresa_id,producto_id,proveedor_id,codigo_proveedor,costo,principal) VALUES(?,?,?,?,?,?)');for(const r of proveedores||[]){if(r.proveedorId)ins.run(empresaId,productoId,Number(r.proveedorId),r.codigoProveedor||null,Number(r.costo||0),r.principal?1:0)}}
function crearProducto({ empresaId, data }) {
  const p = normalizeData(data);
  const tx=db.transaction(()=>{const r = db.prepare(`INSERT INTO productos (empresa_id,codigo,codigo_barra,descripcion,precio,iva,unidad,activo,costo,utilidad,rubro_id,subrubro_id,marca_id,unidad_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(empresaId,p.codigo,p.codigo_barra,p.descripcion,p.precio,p.iva,p.unidad,p.activo,p.costo,p.utilidad,p.rubro_id,p.subrubro_id,p.marca_id,p.unidad_id);saveSuppliers({empresaId,productoId:r.lastInsertRowid,proveedores:p.proveedores});saveCodigosBarras({empresaId,productoId:r.lastInsertRowid,codigos:p.codigosBarras});return r.lastInsertRowid});const id=tx();return obtenerProducto({ id, empresaId });
}
function actualizarProducto({ id, empresaId, data }) {
  const p = normalizeData(data);
  const tx=db.transaction(()=>{db.prepare(`UPDATE productos SET codigo=?,codigo_barra=?,descripcion=?,precio=?,iva=?,unidad=?,activo=?,costo=?,utilidad=?,rubro_id=?,subrubro_id=?,marca_id=?,unidad_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?`).run(p.codigo,p.codigo_barra,p.descripcion,p.precio,p.iva,p.unidad,p.activo,p.costo,p.utilidad,p.rubro_id,p.subrubro_id,p.marca_id,p.unidad_id,id,empresaId);saveSuppliers({empresaId,productoId:id,proveedores:p.proveedores});db.prepare('DELETE FROM producto_codigos_barras WHERE empresa_id=? AND producto_id=?').run(empresaId,id);saveCodigosBarras({empresaId,productoId:id,codigos:p.codigosBarras})});tx();return obtenerProducto({ id, empresaId });
}
function desactivarProducto({ id, empresaId }) { db.prepare('UPDATE productos SET activo=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?').run(id,empresaId); return obtenerProducto({ id, empresaId }); }

function listarCodigosBarras({ empresaId, productoId }) {
  if (!productoId) return [];
  return db.prepare('SELECT id, producto_id AS productoId, codigo_barra AS codigoBarra, cantidad FROM producto_codigos_barras WHERE empresa_id=? AND producto_id=? ORDER BY cantidad, codigo_barra').all(empresaId, productoId);
}
function saveCodigosBarras({ empresaId, productoId, codigos }) {
  const filas = (codigos || []).map((c) => ({ barra: String(c.codigoBarra || c.codigo_barra || '').trim(), cantidad: Number(c.cantidad || 1) })).filter((c) => c.barra && c.cantidad > 1);
  const ins = db.prepare('INSERT INTO producto_codigos_barras(empresa_id, producto_id, codigo_barra, cantidad) VALUES(?,?,?,?)');
  const principal = String(db.prepare('SELECT codigo_barra FROM productos WHERE id=? AND empresa_id=?').get(productoId, empresaId)?.codigo_barra || '').trim();
  for (const c of filas) {
    if (principal && c.barra === principal) { const e = new Error(`El código de barras ${c.barra} ya es el código principal de este producto.`); e.statusCode = 409; throw e; }
    const choque = db.prepare('SELECT id FROM productos WHERE empresa_id=? AND codigo_barra=? AND id<>?').get(empresaId, c.barra, productoId);
    if (choque) { const e = new Error(`El código de barras ${c.barra} ya está asignado a otro producto.`); e.statusCode = 409; throw e; }
    try { ins.run(empresaId, productoId, c.barra, c.cantidad); }
    catch (err) { const e = new Error(`El código de barras ${c.barra} ya está registrado (duplicado o repetido).`); e.statusCode = 409; throw e; }
  }
}
function getProductoPorCodigoBarraConPack({ codigoBarra, empresaId }) {
  const barra = String(codigoBarra || '').trim();
  if (!barra) return null;
  const directo = db.prepare('SELECT * FROM productos WHERE empresa_id=? AND codigo_barra=? AND activo=1').get(empresaId, barra);
  if (directo) return { producto: mapProducto(directo), cantidad: 1 };
  const pack = db.prepare('SELECT p.*, pcb.cantidad FROM producto_codigos_barras pcb JOIN productos p ON p.id=pcb.producto_id WHERE pcb.empresa_id=? AND pcb.codigo_barra=? AND p.activo=1').get(empresaId, barra);
  if (pack) return { producto: mapProducto(pack), cantidad: Number(pack.cantidad || 1) };
  return null;
}

function getProductoByCodigoEmpresa({ codigo, empresaId }) {
  return mapProducto(db.prepare('SELECT * FROM productos WHERE codigo = ? AND empresa_id = ?').get(String(codigo || '').trim(), empresaId));
}

module.exports.listarProductos = listarProductos;
module.exports.obtenerProducto = obtenerProducto;
module.exports.crearProducto = crearProducto;
module.exports.actualizarProducto = actualizarProducto;
module.exports.desactivarProducto = desactivarProducto;
module.exports.getProductoByCodigoEmpresa = getProductoByCodigoEmpresa;
module.exports.listarCodigosBarras = listarCodigosBarras;
module.exports.getProductoPorCodigoBarraConPack = getProductoPorCodigoBarraConPack;
