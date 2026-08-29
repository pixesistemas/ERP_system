const CompanyResolver = require("../resolvers/companyResolver");
const CustomerResolver = require("../resolvers/customerResolver");
const ProductResolver = require("../resolvers/productResolver");

const { AFIPClient } = require("../../afip");

const Factura = require("../../domain/Factura");

class FacturaFactory {
  static async create(data) {
    const companyResolver = new CompanyResolver();

    const empresa = companyResolver.resolve(data.empresa);

    const afip = AFIPClient.fromEmpresa(empresa);

    const customerResolver = new CustomerResolver(afip);

    const cliente = await customerResolver.resolve(data.cliente);

    const productResolver = new ProductResolver();

    const items = productResolver.resolveItems(data.items || [], {
      empresaId: empresa.id,
      clienteDoc: cliente.cuit || cliente.dni || null,
      listaNombre: data.listaPrecio || "GENERAL",
    });

    const factura = new Factura({
      empresa,
      cliente,
      operacion: data.operacion || "FACTURA",
    });

    items.forEach((item) => factura.agregarItem(item));

    return {
      factura,
      afip,
    };
  }
}

module.exports = FacturaFactory;
