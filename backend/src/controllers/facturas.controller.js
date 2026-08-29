const { AFIPClient } = require("../afip");

async function crearFactura(req, res, next) {
  try {
    const empresa = req.body.empresa || "empresa1";

    const afip = AFIPClient.create(empresa);

    const result = await afip.wsfe.createInvoice(req.body);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  crearFactura,
};
