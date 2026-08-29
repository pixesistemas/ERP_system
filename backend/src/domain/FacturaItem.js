class FacturaItem {
  constructor({ producto, cantidad = 1, precioUnitario, descuento = 0 }) {
    this.productoId = producto.id || null;
    this.producto = producto;
    this.codigo = producto.codigo;
    this.descripcion = producto.descripcion;
    this.unidad = producto.unidad;

    this.cantidad = Number(cantidad);
    this.precioUnitario = Number(precioUnitario ?? producto.precio);
    this.descuento = Number(descuento || 0);
    this.iva = Number(producto.iva || 0);
  }

  subtotal() {
    const bruto = this.cantidad * this.precioUnitario;
    return bruto - (bruto * this.descuento) / 100;
  }

  ivaImporte() {
    return (this.subtotal() * this.iva) / 100;
  }

  total() {
    return this.subtotal() + this.ivaImporte();
  }

  toPlainObject() {
    return {
      productoId: this.productoId,
      codigo: this.codigo,
      descripcion: this.descripcion,
      unidad: this.unidad,
      cantidad: this.cantidad,
      precioUnitario: this.precioUnitario,
      descuento: this.descuento,
      iva: this.iva,
    };
  }
}

module.exports = FacturaItem;
