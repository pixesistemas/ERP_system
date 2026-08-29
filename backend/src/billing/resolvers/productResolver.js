const {
  getProductoByCodigo,
  getProductoByCodigoBarra,
  buscarProducto,
} = require("../../repositories/producto.repository");

const Producto = require("../../domain/Producto");
const FacturaItem = require("../../domain/FacturaItem");

const { calcularPrecio } = require("../../services/pricingEngine.service");

class ProductResolver {
  resolveItem(item, context = {}) {
    let productoDb = null;

    if (item.codigo) {
      productoDb = getProductoByCodigo(item.codigo);
    }

    if (!productoDb && item.codigoBarra) {
      productoDb = getProductoByCodigoBarra(item.codigoBarra);
    }

    if (!productoDb && item.descripcion) {
      productoDb = buscarProducto(item.descripcion);
    }

    if (!productoDb) {
      if (!item.descripcion || item.precioUnitario == null) {
        throw new Error(
          "Producto no encontrado. Envíe código válido o descripción + precioUnitario.",
        );
      }

      const productoManual = new Producto({
        codigo: item.codigo || null,
        codigoBarra: item.codigoBarra || null,
        descripcion: item.descripcion,
        precio: item.precioUnitario,
        iva: item.iva ?? 21,
        unidad: item.unidad || "UN",
      });

      return new FacturaItem({
        producto: productoManual,
        cantidad: item.cantidad || 1,
        precioUnitario: item.precioUnitario,
        descuento: item.descuento || 0,
      });
    }

    const producto = new Producto(productoDb);

    const precio = calcularPrecio({
      empresaId: context.empresaId,
      producto,
      clienteDoc: context.clienteDoc,
      listaNombre: item.lista || context.listaNombre || "GENERAL",
    });

    return new FacturaItem({
      producto,
      cantidad: item.cantidad || 1,
      precioUnitario: item.precioUnitario ?? precio.precioFinal,
      descuento: item.descuento || 0,
    });
  }

  resolveItems(items, context = {}) {
    return (items || []).map((item) => this.resolveItem(item, context));
  }
}

module.exports = ProductResolver;
