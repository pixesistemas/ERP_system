const CommercialParser = require("../../src/core/commercial-parser");

/*
 * Casos utilizados para comprobar
 * descuentos globales en porcentaje.
 */
const messages = [
  "Presupuesto para José con 20 bolsas de cemento y descuento del 10%",

  "Facturame a Juan por 5 hierros con 7,5% de descuento",

  "Presupuesto para Pedro descuento 5",

  "Factura para López por 10 cementos y rebaja del 8%",

  "Presupuesto para José sin descuento",

  "Presupuesto para José con 10 hierros contado",
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
      discount: command.discount,
    },
    {
      depth: null,
    },
  );
}
