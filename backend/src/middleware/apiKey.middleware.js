const { getEmpresaByApiKey } = require("../repositories/empresa.repository");

function apiKeyMiddleware(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({
      ok: false,
      error: "Falta header x-api-key",
    });
  }

  const empresa = getEmpresaByApiKey(apiKey);

  if (!empresa) {
    return res.status(401).json({
      ok: false,
      error: "API Key inválida o inactiva",
    });
  }

  req.empresa = empresa;

  next();
}

module.exports = apiKeyMiddleware;
