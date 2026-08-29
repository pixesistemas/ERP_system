const {
  getListaByNombre,
  getPrecioLista,
  getDescuentoCliente,
} = require("../repositories/pricing.repository");

function calcularPrecio({
  empresaId,
  producto,
  clienteDoc = null,
  listaNombre = "GENERAL",
}) {
  let precioBase = Number(producto.precio || 0);
  let origen = "PRODUCTO";

  const lista = getListaByNombre({
    empresaId,
    nombre: listaNombre,
  });

  if (lista) {
    const precioLista = getPrecioLista({
      listaId: lista.id,
      productoId: producto.id,
    });

    if (precioLista) {
      precioBase = Number(precioLista.precio);
      origen = `LISTA:${listaNombre}`;
    }
  }

  let descuentoPorcentaje = 0;

  if (clienteDoc) {
    const descuento = getDescuentoCliente({
      empresaId,
      clienteDoc,
      productoId: producto.id,
    });

    if (descuento) {
      descuentoPorcentaje = Number(descuento.porcentaje || 0);
    }
  }

  const precioFinal = precioBase - (precioBase * descuentoPorcentaje) / 100;

  return {
    precioBase,
    descuentoPorcentaje,
    precioFinal,
    origen,
  };
}

module.exports = {
  calcularPrecio,
};
