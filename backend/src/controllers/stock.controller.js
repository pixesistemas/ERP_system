const {
  getDepositoPrincipal,
  moverStock,
  listarStock,
  listarMovimientos,
} = require("../repositories/stock.repository");
const db = require("../db/database");

function resolveProductoId({ empresaId, productoId, codigo, codigoBarra, texto }) {
  if (productoId) return Number(productoId);
  const value = String(codigo || codigoBarra || texto || "").trim();
  if (!value) return null;
  const producto = db.prepare(`
    SELECT id FROM productos
    WHERE empresa_id = ? AND activo = 1
      AND (codigo = ? OR codigo_barra = ? OR descripcion LIKE ? COLLATE NOCASE)
    ORDER BY CASE WHEN codigo = ? OR codigo_barra = ? THEN 0 ELSE 1 END, descripcion
    LIMIT 1
  `).get(empresaId, value, value, `%${value}%`, value, value);
  return producto?.id || null;
}

function movimientos(req, res, next) {
  try {
    const data = listarMovimientos({ empresaId: req.empresa.id, limit: req.query.limit || 100 });
    res.json({ ok: true, total: data.length, movimientos: data });
  } catch (error) { next(error); }
}

function listar(req, res, next) {
  try {
    const stock = listarStock({
      empresaId: req.empresa.id,
    });

    res.json({
      ok: true,
      total: stock.length,
      stock,
    });
  } catch (error) {
    next(error);
  }
}

function entrada(req, res, next) {
  try {
    const deposito = getDepositoPrincipal(req.empresa.id);

    if (!deposito) {
      return res.status(400).json({
        ok: false,
        error: "No existe depósito principal",
      });
    }

    const { productoId, codigo, codigoBarra, texto, cantidad, motivo } = req.body;
    const resolvedProductoId = resolveProductoId({ empresaId: req.empresa.id, productoId, codigo, codigoBarra, texto });

    if (!resolvedProductoId || !cantidad) {
      return res.status(400).json({
        ok: false,
        error: "Debe seleccionar un producto e informar cantidad",
      });
    }

    const stock = moverStock({
      empresaId: req.empresa.id,
      depositoId: deposito.id,
      productoId: resolvedProductoId,
      tipo: "ENTRADA",
      cantidad,
      motivo: motivo || "Entrada manual",
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      stock,
    });
  } catch (error) {
    next(error);
  }
}

function salida(req, res, next) {
  try {
    const deposito = getDepositoPrincipal(req.empresa.id);

    if (!deposito) {
      return res.status(400).json({
        ok: false,
        error: "No existe depósito principal",
      });
    }

    const { productoId, codigo, codigoBarra, texto, cantidad, motivo } = req.body;
    const resolvedProductoId = resolveProductoId({ empresaId: req.empresa.id, productoId, codigo, codigoBarra, texto });

    if (!resolvedProductoId || !cantidad) {
      return res.status(400).json({
        ok: false,
        error: "Debe seleccionar un producto e informar cantidad",
      });
    }

    const stock = moverStock({
      empresaId: req.empresa.id,
      depositoId: deposito.id,
      productoId: resolvedProductoId,
      tipo: "SALIDA",
      cantidad,
      motivo: motivo || "Salida manual",
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      stock,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listar,
  entrada,
  salida,
  movimientos,
};
