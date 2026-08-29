const {
  listarComisiones,
  liquidarComisiones,
  listarLiquidaciones,
} = require("../repositories/comision.repository");

function listar(req, res, next) {
  try {
    const comisiones = listarComisiones({
      empresaId: req.empresa.id,
      vendedorId: req.query.vendedorId || null,
    });

    res.json({
      ok: true,
      total: comisiones.length,
      comisiones,
    });
  } catch (error) {
    next(error);
  }
}
function liquidar(req, res, next) {
  try {
    const result = liquidarComisiones({
      empresaId: req.empresa.id,
      vendedorId: req.body.vendedorId,
      usuarioId: req.usuario?.id || null,
      observaciones: req.body.observaciones || null,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

function liquidaciones(req, res, next) {
  try {
    const data = listarLiquidaciones({
      empresaId: req.empresa.id,
      vendedorId: req.query.vendedorId || null,
    });

    res.json({
      ok: true,
      total: data.length,
      liquidaciones: data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listar,
  liquidar,
  liquidaciones,
};
