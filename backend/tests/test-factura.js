require("dotenv").config();

const { AFIPClient } = require("../src/afip");

async function main() {
  const afip = await AFIPClient.create(empresa);

  const result = await afip.wsfe.createInvoice({
    puntoVenta: 1,
    tipoComprobante: 1, // 1 = Factura A

    docTipo: 80, // CUIT
    docNro: 20333170818,

    importeNeto: 1000,
    importeIva: 210,
    ivaId: 5, // 21%
  });

  console.dir(result, { depth: null });
}

main().catch(console.error);
