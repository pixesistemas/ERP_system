const { getEmpresaByNombre } = require("../repositories/empresa.repository");
const { listFacturas } = require("../repositories/factura.repository");

function listarFacturas(req, res, next) {
  try {
    const empresaNombre = req.query.empresa || "empresa1";

    const empresa = getEmpresaByNombre(empresaNombre);

    const facturas = listFacturas({
      empresaId: empresa.id,
      limit: Number(req.query.limit || 50),
    });

    res.json({
      ok: true,
      total: facturas.length,
      facturas,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listarFacturas,
};
