const BusinessSessionEngine = require("../session/businessSessionEngine");

/*
 * Crea una nueva sesión comercial.
 */
function crear(req, res, next) {
  try {
    const session = BusinessSessionEngine.create({
      empresaId: req.empresa.id,
      usuarioId: req.usuario?.id || null,
      nombre: req.body.nombre || "Sesión comercial",
      canal: req.body.canal || "API",
      telefonoOrigen: req.body.telefonoOrigen || null,
    });

    res.json({
      ok: true,
      session,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Lista sesiones de trabajo del usuario actual.
 */
function listar(req, res, next) {
  try {
    const sessions = BusinessSessionEngine.list({
      empresaId: req.empresa.id,
      usuarioId: req.query.todos === "true" ? null : req.usuario?.id || null,
      estado: req.query.estado || null,
      limit: Math.min(Number(req.query.limit || 50), 100),
    });

    res.json({
      ok: true,
      total: sessions.length,
      sessions,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Obtiene una sesión completa por ID.
 */
function obtener(req, res, next) {
  try {
    const session = BusinessSessionEngine.load(Number(req.params.id));

    if (Number(session.empresaId) !== Number(req.empresa.id)) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    res.json({
      ok: true,
      session,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Agrega un workspace existente a la sesión.
 */
function agregarWorkspace(req, res, next) {
  try {
    const session = BusinessSessionEngine.addWorkspace({
      sessionId: Number(req.params.id),
      workspaceId: Number(req.body.workspaceId),
      empresaId: req.empresa.id,
      orden: Number(req.body.orden || 0),
    });

    res.json({
      ok: true,
      session,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Quita un workspace de la sesión.
 */
function quitarWorkspace(req, res, next) {
  try {
    const session = BusinessSessionEngine.removeWorkspace({
      sessionId: Number(req.params.id),
      workspaceId: Number(req.params.workspaceId),
      empresaId: req.empresa.id,
    });

    res.json({
      ok: true,
      session,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Cierra una sesión de trabajo.
 */
function cerrar(req, res, next) {
  try {
    const session = BusinessSessionEngine.close({
      sessionId: Number(req.params.id),
      empresaId: req.empresa.id,
    });

    res.json({
      ok: true,
      session,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Devuelve un resumen compacto de la sesión.
 */
function resumen(req, res, next) {
  try {
    const session = BusinessSessionEngine.load(Number(req.params.id));

    if (Number(session.empresaId) !== Number(req.empresa.id)) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    res.json({
      ok: true,
      resumen: session.getSummary(),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  crear,
  listar,
  obtener,
  agregarWorkspace,
  quitarWorkspace,
  cerrar,
  resumen,
};
