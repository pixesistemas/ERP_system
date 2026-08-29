const CommercialParser = require("../../src/core/commercial-parser");

/*
 * Casos para verificar la detección
 * de condiciones y medios de pago.
 */
const messages = [
  "Presupuesto para José por 10 hierros contado",

  "Facturame a Juan por 5 cementos en efectivo",

  "Factura para López por transferencia",

  "Presupuesto para Pedro en cuenta corriente",

  "Factura para María con tarjeta",

  "Remito para Construcciones Norte con cheque",

  "Presupuesto para José por Mercado Pago",

  "Presupuesto para José sin forma de pago",
];

for (const message of messages) {
  const command = CommercialParser.Parser.parse({
    message,
    channel: "WHATSAPP",
  });

  console.log("\n--------------------------------");

  console.log("Mensaje:", message);

  console.dir(
    {
      operation: command.operation,
      customer: command.customer,
      products: command.products,
      payment: command.payment,
    },
    {
      depth: null,
    },
  );
}
