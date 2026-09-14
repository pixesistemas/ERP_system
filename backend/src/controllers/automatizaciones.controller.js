const svc = require("../services/automatizaciones.service");

function empresaId(req) {
  return Number(req.empresa?.id || 0);
}

function config(req, res) {
  res.json({ ok: true, config: svc.getConfig(empresaId(req)) });
}

async function reporteDiarioPreview(req, res) {
  res.json({ ok: true, reporte: svc.reporteDiario(empresaId(req)) });
}

async function reporteDiario(req, res, next) {
  try {
    res.json({ ok: true, ...(await svc.enviarReporteDiario(empresaId(req))) });
  } catch (e) {
    next(e);
  }
}

function stockMinimo(req, res) {
  res.json({ ok: true, items: svc.stockMinimo(empresaId(req)) });
}

async function alertarStock(req, res, next) {
  try {
    res.json({ ok: true, ...(await svc.alertarStockMinimo(empresaId(req))) });
  } catch (e) {
    next(e);
  }
}

async function reintentarCae(req, res, next) {
  try {
    res.json({ ok: true, ...(await svc.reintentarCae(empresaId(req))) });
  } catch (e) {
    next(e);
  }
}

function cobranzas(req, res) {
  res.json({ ok: true, deudores: svc.cobranzas(empresaId(req)) });
}

async function enviarCobranzas(req, res, next) {
  try {
    res.json({ ok: true, ...(await svc.enviarCobranzas(empresaId(req))) });
  } catch (e) {
    next(e);
  }
}

async function conciliarPago(req, res, next) {
  try {
    const externalId = req.body?.externalId || req.body?.external_reference || req.query?.externalId;
    res.json(await svc.conciliarPago({ empresaId: empresaId(req), externalId }));
  } catch (e) {
    next(e);
  }
}

async function backup(req, res, next) {
  try {
    res.json(await svc.crearBackup());
  } catch (e) {
    next(e);
  }
}

function descargarBackup(req, res) {
  const archivo = svc.backupMasReciente();
  if (!archivo) return res.status(404).json({ ok: false, error: "No hay backups disponibles." });
  res.download(archivo);
}

async function avisarReparto(req, res, next) {
  try {
    res.json(await svc.avisarReparto(empresaId(req), Number(req.body?.documentoId), req.body?.estado));
  } catch (e) {
    next(e);
  }
}

async function escalar(req, res, next) {
  try {
    res.json(await svc.escalar(empresaId(req), { telefono: req.body?.telefono, mensaje: req.body?.mensaje }));
  } catch (e) {
    next(e);
  }
}

module.exports = {
  config,
  reporteDiario,
  reporteDiarioPreview,
  stockMinimo,
  alertarStock,
  reintentarCae,
  cobranzas,
  enviarCobranzas,
  conciliarPago,
  backup,
  descargarBackup,
  avisarReparto,
  escalar,
};
