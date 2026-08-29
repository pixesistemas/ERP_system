const { AFIPClient } = require("../afip");

async function consultarPersona(req, res, next) {
  try {
    const empresa = req.query.empresa || "empresa1";

    const cuit = Number(req.params.cuit);

    const afip = AFIPClient.create(empresa);

    const persona = await afip.padron.getPersona(cuit);

    res.json({
      ok: true,
      persona,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  consultarPersona,
};
