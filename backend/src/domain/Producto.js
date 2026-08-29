class Producto {
  constructor(data) {
    this.id = data.id || null;
    this.codigo = data.codigo || null;
    this.codigoBarra = data.codigoBarra || null;
    this.descripcion = data.descripcion;
    this.precio = Number(data.precio || data.precioUnitario || 0);
    this.iva = Number(data.iva ?? 21);
    this.unidad = data.unidad || "UN";
  }
}

module.exports = Producto;
