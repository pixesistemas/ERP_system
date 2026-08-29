const { listAuditLogs } = require("../repositories/audit.repository");

function listar(req, res, next) {
  try {
    const logs = listAuditLogs({
      empresaId: req.empresa.id,
      limit: req.query.limit || 100,
    });

    res.json({
      ok: true,
      total: logs.length,
      logs,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listar,
};
