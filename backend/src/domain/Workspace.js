/*
 * Workspace
 *
 * Representa una operación comercial en construcción.
 * Contiene las reglas del borrador, cálculo de totales
 * y validaciones necesarias antes de confirmarlo.
 */
class Workspace {
  /*
   * Inicializa el workspace con los datos recuperados
   * desde la base de datos.
   */
  constructor(data = {}) {
    this.id = data.id || null;

    this.empresaId = data.empresaId || data.empresa_id || null;

    this.usuarioId = data.usuarioId || data.usuario_id || null;

    this.canal = data.canal || "API";

    this.telefonoOrigen = data.telefonoOrigen || data.telefono_origen || null;

    this.tipoOperacion = data.tipoOperacion || data.tipo_operacion || null;

    this.estado = data.estado || "BORRADOR";

    this.clienteId = data.clienteId || data.cliente_id || null;

    this.vendedorId = data.vendedorId || data.vendedor_id || null;

    this.condicionVenta =
      data.condicionVenta || data.condicion_venta || "CONTADO";

    this.listaPrecio = data.listaPrecio || data.lista_precio || "GENERAL";

    this.descuentoGeneral = Number(
      data.descuentoGeneral ?? data.descuento_general ?? 0,
    );

    this.observaciones = data.observaciones || null;

    this.fechaEntrega = data.fechaEntrega || data.fecha_entrega || null;

    this.items = Array.isArray(data.items) ? data.items : [];

    this.timeline = Array.isArray(data.timeline) ? data.timeline : [];
  }

  /*
   * Calcula los totales originales de todos
   * los artículos del workspace.
   */
  calculateItemTotals() {
    return this.items.reduce(
      (totals, item) => {
        totals.neto += Number(item.subtotal || 0);

        totals.iva += Number(item.iva_importe ?? item.ivaImporte ?? 0);

        totals.total += Number(item.total || 0);

        return totals;
      },
      {
        neto: 0,
        iva: 0,
        total: 0,
      },
    );
  }

  /*
   * Calcula los totales finales del workspace.
   *
   * Primero suma todos los artículos y después
   * aplica el descuento general de la operación.
   */
  calculateTotals() {
    const itemTotals = this.calculateItemTotals();

    const descuentoPorcentaje = this.normalizeDiscount(this.descuentoGeneral);

    const descuentoNeto = (itemTotals.neto * descuentoPorcentaje) / 100;

    const descuentoIva = (itemTotals.iva * descuentoPorcentaje) / 100;

    const descuentoTotal = (itemTotals.total * descuentoPorcentaje) / 100;

    return {
      netoBruto: this.roundMoney(itemTotals.neto),

      ivaBruto: this.roundMoney(itemTotals.iva),

      totalBruto: this.roundMoney(itemTotals.total),

      descuentoPorcentaje: this.roundMoney(descuentoPorcentaje),

      descuentoNeto: this.roundMoney(descuentoNeto),

      descuentoIva: this.roundMoney(descuentoIva),

      descuentoTotal: this.roundMoney(descuentoTotal),

      neto: this.roundMoney(itemTotals.neto - descuentoNeto),

      iva: this.roundMoney(itemTotals.iva - descuentoIva),

      total: this.roundMoney(itemTotals.total - descuentoTotal),
    };
  }

  /*
   * Normaliza un porcentaje para mantenerlo
   * dentro del rango permitido de 0 a 100.
   */
  normalizeDiscount(value) {
    const numericValue = Number(value || 0);

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.min(100, Math.max(0, numericValue));
  }

  /*
   * Redondea valores monetarios
   * a dos posiciones decimales.
   */
  roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  /*
   * Indica si el workspace todavía
   * permite modificaciones.
   */
  isEditable() {
    return this.estado === "BORRADOR";
  }

  /*
   * Devuelve los problemas que impiden
   * confirmar la operación comercial.
   */
  getConfirmationErrors() {
    const errors = [];

    if (!this.isEditable()) {
      errors.push("El workspace no está en estado BORRADOR");
    }

    if (!this.tipoOperacion) {
      errors.push("No se informó el tipo de operación");
    }

    if (!this.clienteId) {
      errors.push("Debe seleccionar un cliente");
    }

    if (this.items.length === 0) {
      errors.push("Debe agregar al menos un artículo");
    }

    if (!["CONTADO", "CUENTA_CORRIENTE"].includes(this.condicionVenta)) {
      errors.push("La condición de venta no es válida");
    }

    if (this.descuentoGeneral < 0 || this.descuentoGeneral > 100) {
      errors.push("El descuento general debe estar entre 0 y 100");
    }

    for (const [index, item] of this.items.entries()) {
      if (Number(item.cantidad || 0) <= 0) {
        errors.push(`Artículo ${index + 1}: cantidad inválida`);
      }

      if (!item.descripcion) {
        errors.push(`Artículo ${index + 1}: falta descripción`);
      }

      if (
        Number(item.descuento || 0) < 0 ||
        Number(item.descuento || 0) > 100
      ) {
        errors.push(`Artículo ${index + 1}: descuento inválido`);
      }
    }

    return errors;
  }

  /*
   * Indica si el workspace está listo
   * para confirmarse.
   */
  canConfirm() {
    return this.getConfirmationErrors().length === 0;
  }

  /*
   * Genera el resumen que se muestra
   * antes de confirmar la operación.
   */
  getConfirmationSummary() {
    return {
      workspaceId: this.id,

      tipoOperacion: this.tipoOperacion,

      estado: this.estado,

      canal: this.canal,

      telefonoOrigen: this.telefonoOrigen,

      clienteId: this.clienteId,

      vendedorId: this.vendedorId,

      condicionVenta: this.condicionVenta,

      listaPrecio: this.listaPrecio,

      descuentoGeneral: this.descuentoGeneral,

      observaciones: this.observaciones,

      fechaEntrega: this.fechaEntrega,

      items: this.items,

      totals: this.calculateTotals(),

      errores: this.getConfirmationErrors(),

      listoParaConfirmar: this.canConfirm(),
    };
  }
}

module.exports = Workspace;
