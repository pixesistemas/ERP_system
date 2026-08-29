const {
  createWorkspace,
  getWorkspaceById,
  setWorkspaceCustomer,
  updateWorkspaceCommercialData,
  addWorkspaceItem,
  updateWorkspaceItem,
  deleteWorkspaceItem,
  updateWorkspaceStatus,
  listWorkspaces,
} = require("../repositories/workspace.repository");

const Producto = require("../domain/Producto");

const Workspace = require("../domain/Workspace");

const { getProductoById } = require("../repositories/producto.repository");

const { getClienteById } = require("../repositories/cliente.repository");

const { calcularPrecio } = require("../services/pricingEngine.service");

const ResolverEngine = require("../resolver/resolverEngine");

/*
 * WorkspaceEngine
 *
 * Administra las operaciones comerciales
 * en construcción.
 */
class WorkspaceEngine {
  /*
   * Crea un nuevo workspace comercial.
   */
  create(data) {
    return createWorkspace(data);
  }

  /*
   * Recupera un workspace completo
   * como objeto de dominio.
   */
  load(workspaceId) {
    const data = getWorkspaceById(workspaceId);

    if (!data) {
      const error = new Error("Workspace no encontrado");

      error.statusCode = 404;

      throw error;
    }

    return this.toDomain(data);
  }

  /*
   * Asigna un cliente al workspace.
   */
  setCustomer(data) {
    return setWorkspaceCustomer(data);
  }

  /*
   * Actualiza los datos comerciales
   * generales del workspace.
   */
  updateCommercialData({
    workspaceId,
    empresaId,
    condicionVenta = undefined,
    listaPrecio = undefined,
    descuentoGeneral = undefined,
    observaciones = undefined,
    fechaEntrega = undefined,
    canal = undefined,
    telefonoOrigen = undefined,
    tipoOperacion = undefined,
    usuarioId = null,
  }) {
    const workspace = this.load(workspaceId);

    this.validateEditableWorkspace({
      workspace,
      empresaId,
    });

    return updateWorkspaceCommercialData({
      workspaceId,
      empresaId,
      condicionVenta,
      listaPrecio,
      descuentoGeneral,
      observaciones,
      fechaEntrega,
      canal,
      telefonoOrigen,
      tipoOperacion,
      usuarioId,
    });
  }

  /*
   * Agrega un artículo directo
   * al workspace.
   */
  addItem(data) {
    return addWorkspaceItem(data);
  }

  /*
   * Cambia el estado
   * del workspace.
   */
  changeStatus(data) {
    return updateWorkspaceStatus(data);
  }

  /*
   * Lista los workspaces
   * pertenecientes a una empresa.
   */
  list(filters) {
    return listWorkspaces(filters);
  }

  /*
   * Calcula los totales usando
   * el objeto de dominio.
   */
  calculateTotals(workspaceData) {
    const workspace =
      workspaceData instanceof Workspace
        ? workspaceData
        : this.toDomain(workspaceData);

    return workspace.calculateTotals();
  }

  /*
   * Devuelve el resumen y las validaciones
   * previas a confirmar un workspace.
   */
  getConfirmationSummary(workspaceId) {
    const workspace = this.load(workspaceId);

    return workspace.getConfirmationSummary();
  }

  /*
   * Agrega un producto existente
   * calculando precio e impuestos.
   */
  addProduct({
    workspaceId,
    empresaId,
    productoId,
    cantidad = 1,
    descuento = 0,
    usuarioId = null,
  }) {
    const workspace = this.load(workspaceId);

    this.validateEditableWorkspace({
      workspace,
      empresaId,
    });

    const productoDb = getProductoById(productoId);

    if (!productoDb) {
      const error = new Error("Producto no encontrado");

      error.statusCode = 404;

      throw error;
    }

    if (
      productoDb.empresa_id &&
      Number(productoDb.empresa_id) !== Number(empresaId)
    ) {
      const error = new Error("El producto no pertenece a esta empresa");

      error.statusCode = 403;

      throw error;
    }

    const producto = new Producto(productoDb);

    const cliente = workspace.clienteId
      ? getClienteById(workspace.clienteId)
      : null;

    const clienteDoc = cliente?.cuit || cliente?.dni || null;

    /*
     * Calcula el precio usando la lista
     * configurada actualmente en el workspace.
     */
    const pricing = calcularPrecio({
      empresaId,
      producto,
      clienteDoc,

      listaNombre: workspace.listaPrecio || "GENERAL",
    });

    return this.addItem({
      workspaceId,

      productoId: producto.id,

      codigo: producto.codigo,

      descripcion: producto.descripcion,

      unidad: producto.unidad || "UN",

      cantidad,

      precioUnitario: pricing.precioFinal,

      descuento,

      iva: producto.iva ?? 21,

      usuarioId,
    });
  }

  /*
   * Modifica cantidad o descuento
   * de un artículo existente.
   */
  updateItem({
    workspaceId,
    empresaId,
    itemId,
    cantidad,
    descuento,
    usuarioId = null,
  }) {
    const workspace = this.load(workspaceId);

    this.validateEditableWorkspace({
      workspace,
      empresaId,
    });

    return updateWorkspaceItem({
      workspaceId,
      itemId,
      cantidad,
      descuento,
      usuarioId,
    });
  }

  /*
   * Elimina un artículo
   * de un workspace editable.
   */
  removeItem({ workspaceId, empresaId, itemId, usuarioId = null }) {
    const workspace = this.load(workspaceId);

    this.validateEditableWorkspace({
      workspace,
      empresaId,
    });

    return deleteWorkspaceItem({
      workspaceId,
      itemId,
      usuarioId,
    });
  }

  /*
   * Verifica que el workspace pertenezca
   * a la empresa y sea editable.
   */
  validateEditableWorkspace({ workspace, empresaId }) {
    if (Number(workspace.empresaId) !== Number(empresaId)) {
      const error = new Error("No autorizado para modificar este workspace");

      error.statusCode = 403;

      throw error;
    }

    if (!workspace.isEditable()) {
      const error = new Error(
        "Solo se pueden modificar workspaces en BORRADOR",
      );

      error.statusCode = 400;

      throw error;
    }
  }

  /*
   * Convierte los datos recuperados
   * desde SQLite en un Workspace.
   */
  toDomain(data) {
    return new Workspace(data);
  }

  /*
   * Busca un cliente por texto y lo asigna
   * cuando existe una coincidencia única.
   */
  resolveAndSetCustomer({ workspaceId, empresaId, texto, usuarioId = null }) {
    const workspace = this.load(workspaceId);

    this.validateEditableWorkspace({
      workspace,
      empresaId,
    });

    const resolucion = ResolverEngine.resolveCustomer({
      empresaId,
      texto,
    });

    if (resolucion.estado !== "RESUELTO") {
      return {
        workspace,
        resolucion,
      };
    }

    const clienteId = resolucion.seleccionado.id;

    const actualizado = this.setCustomer({
      workspaceId,
      empresaId,
      clienteId,
      usuarioId,
    });

    return {
      workspace: actualizado,

      resolucion,
    };
  }

  /*
   * Busca un producto por texto y lo agrega
   * usando Pricing Engine.
   */
  resolveAndAddProduct({
    workspaceId,
    empresaId,
    texto,
    cantidad = 1,
    descuento = 0,
    usuarioId = null,
  }) {
    const workspace = this.load(workspaceId);

    this.validateEditableWorkspace({
      workspace,
      empresaId,
    });

    const resolucion = ResolverEngine.resolveProduct({
      empresaId,
      texto,
    });

    if (resolucion.estado !== "RESUELTO") {
      return {
        workspace,
        resolucion,
      };
    }

    const productoId = resolucion.seleccionado.id;

    const actualizado = this.addProduct({
      workspaceId,
      empresaId,
      productoId,
      cantidad,
      descuento,
      usuarioId,
    });

    return {
      workspace: actualizado,

      resolucion,
    };
  }
}

module.exports = new WorkspaceEngine();
