const repo = require('../repositories/producto.repository');
const db = require('../db/database');

function empresaId(req) { return Number(req.user?.empresaId || req.empresa?.id || 1); }

function list(req, res) {
  const products = repo.listarProductos({ empresaId: empresaId(req), texto: req.query.q || '', includeInactive: req.query.all === '1' });
  res.json({ ok: true, products });
}

function get(req, res) {
  const product = repo.obtenerProducto({ id: Number(req.params.id), empresaId: empresaId(req) });
  if (!product) return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
  res.json({ ok: true, product });
}

function create(req, res) {
  const product = repo.crearProducto({ empresaId: empresaId(req), data: req.body });
  res.status(201).json({ ok: true, product });
}

function update(req, res) {
  const previous = repo.obtenerProducto({ id: Number(req.params.id), empresaId: empresaId(req) });
  if (!previous) return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
  const product = repo.actualizarProducto({ id: Number(req.params.id), empresaId: empresaId(req), data: req.body });
  res.json({ ok: true, product, priceChange: Number(previous.precio) !== Number(product.precio) ? { previous: previous.precio, current: product.precio } : null });
}

function remove(req, res) {
  const product = repo.desactivarProducto({ id: Number(req.params.id), empresaId: empresaId(req) });
  if (!product) return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
  res.json({ ok: true, product });
}

/*
 * Importación masiva con reemplazo por código: si el código ya existe
 * actualiza el producto (precio, costo, descripción, etc.); si no, lo crea.
 * Modos: NUEVOS (solo crear), ACTUALIZAR (solo existentes), AMBOS (default).
 */
function importar(req, res) {
  const e = empresaId(req);
  const modo = String(req.body.modo || 'AMBOS').toUpperCase();
  if (!['NUEVOS', 'ACTUALIZAR', 'AMBOS'].includes(modo)) {
    return res.status(400).json({ ok: false, error: 'Modo inválido. Usá NUEVOS, ACTUALIZAR o AMBOS.' });
  }
  const filas = Array.isArray(req.body.filas) ? req.body.filas : [];
  if (!filas.length) return res.status(400).json({ ok: false, error: 'No hay filas para importar.' });
  const creados = [];
  const actualizados = [];
  const errores = [];
  const tx = db.transaction(() => {
    for (const raw of filas) {
      try {
        const codigo = String(raw.codigo || '').trim();
        if (!codigo) { errores.push({ fila: raw._fila || null, codigo: null, error: 'Falta el código del producto.' }); continue; }
        const existente = repo.getProductoByCodigoEmpresa({ codigo, empresaId: e });
        if (existente && modo === 'NUEVOS') { errores.push({ fila: raw._fila || null, codigo, error: `El código ${codigo} ya existe.` }); continue; }
        if (!existente && modo === 'ACTUALIZAR') { errores.push({ fila: raw._fila || null, codigo, error: `El código ${codigo} no existe.` }); continue; }
        const data = {
          codigo,
          codigoBarra: raw.codigoBarra || null,
          descripcion: String(raw.descripcion || '').trim() || existente?.descripcion || 'SIN DESCRIPCION',
          precio: Number(String(raw.precio ?? 0).replace(',', '.')) || 0,
          costo: Number(String(raw.costo ?? 0).replace(',', '.')) || 0,
          iva: Number(raw.iva ?? 21) || 21,
          unidad: String(raw.unidad || 'UN').trim().toUpperCase() || 'UN',
        };
        if (existente) {
          const producto = repo.actualizarProducto({ id: existente.id, empresaId: e, data });
          actualizados.push({ id: producto.id, codigo: producto.codigo, descripcion: producto.descripcion, precio: producto.precio, precioAnterior: Number(existente.precio) });
        } else {
          const producto = repo.crearProducto({ empresaId: e, data });
          creados.push({ id: producto.id, codigo: producto.codigo, descripcion: producto.descripcion, precio: producto.precio });
        }
      } catch (err) {
        errores.push({ fila: raw._fila || null, codigo: raw.codigo || null, error: err.message });
      }
    }
  });
  tx();
  res.json({ ok: true, modo, creados, actualizados, errores, resumen: { creados: creados.length, actualizados: actualizados.length, errores: errores.length } });
}

module.exports = { list, get, create, update, remove, importar };
