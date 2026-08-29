class Factura {
  constructor({ empresa, cliente, operacion = "FACTURA" }) {
    this.empresa = empresa;
    this.cliente = cliente;
    this.operacion = operacion;

    this.items = [];

    this.tipoComprobante = null;
    this.numero = null;
    this.cae = null;
    this.vencimiento = null;
    this.resultado = null;
  }

  agregarItem(item) {
    this.items.push(item);
  }

  cantidadItems() {
    return this.items.length;
  }

  subtotal() {
    return this.items.reduce((total, item) => total + item.subtotal(), 0);
  }

  ivaTotal() {
    return this.items.reduce((total, item) => total + item.ivaImporte(), 0);
  }

  total() {
    return this.items.reduce((total, item) => total + item.total(), 0);
  }

  toInvoiceBuilderInput() {
    return {
      empresa: this.empresa.nombre,
      operacion: this.operacion,
      cliente: {
        id: this.cliente.id,
        cuit: this.cliente.cuit,
        dni: this.cliente.dni,
        razonSocial: this.cliente.razonSocial,
        condicionIVA: this.cliente.condicionIVA,
        domicilio: this.cliente.domicilio,
        localidad: this.cliente.localidad,
        provincia: this.cliente.provincia,
      },
      items: this.items.map((item) => item.toPlainObject()),
    };
  }
}

module.exports = Factura;
