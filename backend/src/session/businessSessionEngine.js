const BusinessSession = require("../domain/BusinessSession");

const WorkspaceEngine = require("../workspace/workspaceEngine");

const {
  createBusinessSession,
  getBusinessSessionById,
  addWorkspaceToSession,
  removeWorkspaceFromSession,
  closeBusinessSession,
  listBusinessSessions,
} = require("../repositories/businessSession.repository");

/*
 * BusinessSessionEngine
 *
 * Coordina sesiones de trabajo que contienen
 * múltiples workspaces comerciales.
 */
class BusinessSessionEngine {
  /*
   * Convierte datos planos en un objeto de dominio.
   */
  toDomain(data) {
    return new BusinessSession(data);
  }

  /*
   * Crea una nueva sesión de trabajo.
   */
  create(data) {
    const session = createBusinessSession(data);

    return this.toDomain(session);
  }

  /*
   * Carga una sesión completa por su ID.
   */
  load(sessionId) {
    const session = getBusinessSessionById(sessionId);

    if (!session) {
      const error = new Error("Sesión comercial no encontrada");

      error.statusCode = 404;
      throw error;
    }

    return this.toDomain(session);
  }

  /*
   * Agrega un workspace existente a una sesión activa.
   */
  addWorkspace({ sessionId, workspaceId, empresaId, orden = 0 }) {
    const session = this.load(sessionId);

    if (Number(session.empresaId) !== Number(empresaId)) {
      const error = new Error("No autorizado para modificar esta sesión");

      error.statusCode = 403;
      throw error;
    }

    if (!session.isActive()) {
      const error = new Error(
        "No se pueden agregar workspaces a una sesión cerrada",
      );

      error.statusCode = 400;
      throw error;
    }

    const workspace = WorkspaceEngine.load(workspaceId);

    if (Number(workspace.empresaId) !== Number(empresaId)) {
      const error = new Error("El workspace pertenece a otra empresa");

      error.statusCode = 403;
      throw error;
    }

    const updated = addWorkspaceToSession({
      sessionId,
      workspaceId,
      orden,
    });

    return this.toDomain(updated);
  }

  /*
   * Quita un workspace de una sesión sin eliminarlo.
   */
  removeWorkspace({ sessionId, workspaceId, empresaId }) {
    const session = this.load(sessionId);

    if (Number(session.empresaId) !== Number(empresaId)) {
      const error = new Error("No autorizado para modificar esta sesión");

      error.statusCode = 403;
      throw error;
    }

    const updated = removeWorkspaceFromSession({
      sessionId,
      workspaceId,
    });

    return this.toDomain(updated);
  }

  /*
   * Cierra una sesión comercial activa.
   */
  close({ sessionId, empresaId }) {
    const session = closeBusinessSession({
      sessionId,
      empresaId,
    });

    return this.toDomain(session);
  }

  /*
   * Lista sesiones comerciales de una empresa.
   */
  list(filters) {
    return listBusinessSessions(filters).map((session) =>
      this.toDomain(session),
    );
  }

  /*
   * Devuelve un resumen compacto de la sesión.
   */
  getSummary(sessionId) {
    return this.load(sessionId).getSummary();
  }
}

module.exports = new BusinessSessionEngine();
