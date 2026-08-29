const CommercialParser = require("../../src/core/commercial-parser");

/*
 * Mensajes utilizados para comprobar
 * la extracción de productos y cantidades.
 */
const messages = [
  "Haceme un presupuesto para José con 20 bolsas de cemento y 10 hierros del 8",

  "Presupuesto para Ferretería López por 5 cajas de tornillos",

  "Facturame a Juan por 2,5 kilos de clavos contado",

  "10 hierros y 5 bolsas de cemento",

  "Presupuesto para José con cinco cajas de cerámicos",

  "Crear presupuesto para José",
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
    },
    {
      depth: null,
    },
  );
}
