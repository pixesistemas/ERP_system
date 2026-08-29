const { getFacturaById } = require("../repositories/factura.repository");

function getFactura(req, res, next) {
  try {
    const factura = getFacturaById(req.params.id);

    if (!factura) {
      return res.status(404).json({
        ok: false,
        error: "Factura no encontrada",
      });
    }

    if (factura.empresa_id !== req.empresa.id) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado para ver esta factura",
      });
    }

    res.json({
      ok: true,
      factura,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getFactura,
};
