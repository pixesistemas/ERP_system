const db = require("../db/database");

/*
 * Módulos opcionales por empresa (modulos_empresa).
 *
 * El superadmin activa cada módulo desde su panel; los endpoints de un
 * módulo se bloquean si la empresa no lo tiene habilitado.
 */
function empresaTieneModulo(empresaId, modulo) {
  const id = Number(empresaId);
  const clave = String(modulo || "").trim().toUpperCase();
  if (!id || !clave) return false;
  const row = db
    .prepare("SELECT activo FROM modulos_empresa WHERE empresa_id=? AND modulo=?")
    .get(id, clave);
  return Boolean(row && Number(row.activo) === 1);
}

function requireModulo(modulo) {
  return (req, res, next) => {
    const empresaId = Number(
      req.empresa?.id || req.usuario?.empresaId || req.user?.empresaId || 0,
    );
    if (!empresaTieneModulo(empresaId, modulo)) {
      return res.status(403).json({
        ok: false,
        error: "El módulo no está habilitado para esta empresa.",
      });
    }
    next();
  };
}

module.exports = { empresaTieneModulo, requireModulo };
