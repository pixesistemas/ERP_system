const WorkspaceEngine = require("./workspaceEngine");

const ProcessEngine = require("../process/processEngine");
const { getClienteById } = require("../repositories/cliente.repository");

/*
 * WorkspaceConfirmationEngine
 *
 * Convierte un Workspace confirmado en un documento
 * comercial definitivo mediante ProcessEngine.
 */
class WorkspaceConfirmationEngine {
  /*
   * Confirma un workspace y ejecuta
   * el proceso comercial correspondiente.
   */
  async confirm({ workspaceId, empresa, empresaNombre, empresaId, usuarioId }) {
    const workspace = WorkspaceEngine.load(workspaceId);

    /*
     * Mantiene compatibilidad con ambos nombres
     * utilizados para identificar la empresa.
     */
    const empresaSeleccionada = String(empresa || empresaNombre || "").trim();

    if (!empresaSeleccionada) {
      const error = new Error(
        "No se recibió la empresa al confirmar el workspace.",
      );

      error.statusCode = 400;

      error.details = {
        workspaceId,
        empresaId,
      };

      throw error;
    }

    /*
     * Verifica que el workspace corresponda
     * a la empresa autenticada.
     */
    if (Number(workspace.empresaId) !== Number(empresaId)) {
      const error = new Error("El workspace no pertenece a la empresa actual.");

      error.statusCode = 403;

      throw error;
    }

    /*
     * Valida que la operación tenga cliente,
     * productos y todos los datos obligatorios.
     */
    const errores = workspace.getConfirmationErrors();

    if (errores.length > 0) {
      const error = new Error("El workspace todavía no puede confirmarse");

      error.statusCode = 400;
      error.details = errores;

      throw error;
    }

    /*
     * Traduce la operación comercial al proceso
     * registrado en ProcessEngine.
     */
    const proceso = this.resolveProcess(workspace.tipoOperacion);

    if (!proceso) {
      const error = new Error(
        `No existe un proceso para la operación '${workspace.tipoOperacion}'.`,
      );

      error.statusCode = 400;

      throw error;
    }

    /*
     * Calcula los totales finales, incluyendo
     * el descuento general del workspace.
     */
    const totals = workspace.calculateTotals();

    /*
     * Resuelve el cliente completo porque el motor de facturación
     * valida datos comerciales y no trabaja solamente con el ID.
     */
    const cliente = getClienteById(workspace.clienteId);

    if (!cliente) {
      const error = new Error("No se encontró el cliente seleccionado.");
      error.statusCode = 400;
      error.details = { clienteId: workspace.clienteId };
      throw error;
    }

    /*
     * Ejecuta el proceso definitivo enviando
     * todos los datos acumulados.
     */
    const resultado = await ProcessEngine.execute(proceso, {
      empresa: empresaSeleccionada,

      empresaNombre: empresaSeleccionada,

      empresaId: workspace.empresaId,

      workspaceId: workspace.id,

      clienteId: workspace.clienteId,

      cliente,

      vendedorId: workspace.vendedorId,

      condicionVenta: workspace.condicionVenta,

      listaPrecio: workspace.listaPrecio,

      descuentoGeneral: workspace.descuentoGeneral,

      observaciones: workspace.observaciones,

      fechaEntrega: workspace.fechaEntrega,

      canal: workspace.canal,

      telefonoOrigen: workspace.telefonoOrigen,

      totals,

      items: workspace.items.map((item) => ({
        productoId: item.producto_id,

        codigo: item.codigo,

        descripcion: item.descripcion,

        unidad: item.unidad,

        cantidad: Number(item.cantidad || 0),

        precioUnitario: Number(item.precio_unitario || 0),

        descuento: Number(item.descuento || 0),

        iva: Number(item.iva || 0),
      })),

      context: {
        empresaId: workspace.empresaId,

        usuarioId,

        workspaceId: workspace.id,

        empresa: empresaSeleccionada,

        empresaNombre: empresaSeleccionada,

        canal: workspace.canal,

        telefonoOrigen: workspace.telefonoOrigen,
      },
    });

    /*
     * Cambia el estado únicamente cuando todo
     * el proceso final terminó correctamente.
     */
    WorkspaceEngine.changeStatus({
      workspaceId,
      empresaId,
      estado: "CONFIRMADO",
      usuarioId,
    });

    return resultado;
  }

  /*
   * Traduce el tipo de operación al nombre
   * registrado dentro de ProcessEngine.
   */
  resolveProcess(tipo) {
    const normalized = String(tipo || "")
      .trim()
      .toUpperCase();

    const procesos = {
      PRESUPUESTO: "CREAR_PRESUPUESTO",

      REMITO: "CREAR_REMITO",

      NOTA_PEDIDO: "CREAR_NOTA_PEDIDO",

      NOTA_CREDITO: "CREAR_NOTA_CREDITO",

      FACTURA: "VENTA",
    };

    return procesos[normalized] || null;
  }
}

module.exports = new WorkspaceConfirmationEngine();
