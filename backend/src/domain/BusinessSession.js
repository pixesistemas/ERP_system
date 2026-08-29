/*
 * BusinessSession
 *
 * Representa una sesión de trabajo con una o varias
 * operaciones comerciales abiertas simultáneamente.
 */
class BusinessSession {
  constructor(data = {}) {
    this.id = data.id || null;
    this.empresaId = data.empresaId || null;
    this.usuarioId = data.usuarioId || null;

    this.nombre = data.nombre || "Nueva sesión";
    this.estado = data.estado || "ACTIVA";

    this.canal = data.canal || "API";
    this.telefonoOrigen = data.telefonoOrigen || null;

    this.workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];

    this.createdAt = data.createdAt || null;
    this.updatedAt = data.updatedAt || null;
    this.closedAt = data.closedAt || null;
  }

  /*
   * Indica si todavía se pueden agregar operaciones.
   */
  isActive() {
    return this.estado === "ACTIVA";
  }

  /*
   * Devuelve la cantidad de workspaces abiertos.
   */
  getWorkspaceCount() {
    return this.workspaces.length;
  }

  /*
   * Indica si un workspace ya forma parte de la sesión.
   */
  containsWorkspace(workspaceId) {
    return this.workspaces.some(
      (workspace) => Number(workspace.id) === Number(workspaceId),
    );
  }

  /*
   * Devuelve un resumen de la sesión para React o WhatsApp.
   */
  getSummary() {
    return {
      id: this.id,
      nombre: this.nombre,
      estado: this.estado,
      canal: this.canal,
      cantidadWorkspaces: this.getWorkspaceCount(),

      workspaces: this.workspaces.map((workspace) => ({
        id: workspace.id,
        tipoOperacion: workspace.tipo_operacion,
        estado: workspace.estado,
        clienteId: workspace.cliente_id,
        createdAt: workspace.created_at,
      })),
    };
  }
}

module.exports = BusinessSession;
