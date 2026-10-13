const TN = require("../services/tiendanube.service");

function empresaId(req) {
  return Number(req.empresa?.id || req.usuario?.empresaId || 1);
}

function getConfig(req, res) {
  res.json({ ok: true, ...TN.getConfigPublica(empresaId(req)) });
}

function saveConfig(req, res) {
  try {
    res.json({ ok: true, ...TN.saveConfig(empresaId(req), req.body || {}) });
  } catch (error) {
    res.status(error.statusCode || 400).json({ ok: false, error: error.message });
  }
}

function manejar(fn) {
  return async (req, res) => {
    try {
      const r = await fn(empresaId(req), req.body || {});
      res.json({ ok: true, ...r });
    } catch (error) {
      res.status(error.statusCode || 500).json({ ok: false, error: error.message });
    }
  };
}

module.exports = {
  getConfig,
  saveConfig,
  probar: manejar((e) => TN.probar(e)),
  exportarProductos: manejar((e, d) => TN.exportarProductos(e, { limite: d.limite })),
  exportarStock: manejar((e, d) => TN.exportarStock(e, { limite: d.limite })),
  importarPedidos: manejar((e, d) => TN.importarPedidos(e, { limite: d.limite })),
};
