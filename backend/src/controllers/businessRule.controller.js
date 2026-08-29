const {
  crearRegla,
  listarReglasActivasPorEvento,
} = require("../repositories/businessRule.repository");

function crear(req, res, next) {
  try {
    const regla = crearRegla({
      empresaId: req.empresa.id,
      nombre: req.body.nombre,
      evento: req.body.evento,
      condicion: req.body.condicion,
      accion: req.body.accion,
    });

    res.json({
      ok: true,
      regla,
    });
  } catch (error) {
    next(error);
  }
}

function listarPorEvento(req, res, next) {
  try {
    const reglas = listarReglasActivasPorEvento({
      empresaId: req.empresa.id,
      evento: req.params.evento,
    });

    res.json({
      ok: true,
      total: reglas.length,
      reglas,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  crear,
  listarPorEvento,
};
