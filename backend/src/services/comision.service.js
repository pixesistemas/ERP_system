const { getVendedorById } = require("../repositories/vendedor.repository");
const { registrarComision } = require("../repositories/comision.repository");

function generarComisionPorFactura({ factura, saved, vendedorId }) {
  if (!vendedorId) return null;

  const vendedor = getVendedorById(vendedorId);

  if (!vendedor) {
    throw new Error("Vendedor no encontrado");
  }

  return registrarComision({
    empresaId: factura.empresa.id,
    vendedorId,
    origenTipo: "FACTURA",
    origenId: saved.facturaId,
    clienteDoc: factura.cliente.cuit || factura.cliente.dni || "0",
    clienteNombre: factura.cliente.razonSocial,
    baseCalculo: factura.total(),
    porcentaje: vendedor.comisionPorcentaje,
    observaciones: "Comisión generada automáticamente por factura",
  });
}

module.exports = {
  generarComisionPorFactura,
};
