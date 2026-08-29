require("dotenv").config();

const { AFIPClient } = require("../src/afip");

async function main() {
  const afip = AFIPClient.create("empresa1");

  const puntoVenta = 1;
  const tipoComprobante = 1;

  const ultimo = await afip.wsfe.getLastVoucher(puntoVenta, tipoComprobante);

  console.dir(ultimo, { depth: null });
}

main().catch(console.error);
