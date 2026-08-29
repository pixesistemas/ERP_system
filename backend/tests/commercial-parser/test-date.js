const CommercialParser = require("../../src/core/commercial-parser");

/*
 * Casos utilizados para verificar
 * la detección de fechas de entrega.
 */
const messages = [
  "Presupuesto para José con 10 hierros, entregar mañana",

  "Nota de pedido para Juan con 20 cementos, entrega el 25/07/2026",

  "Remito para López con 5 cajas, entregar el lunes",

  "Presupuesto para Pedro con 10 hierros para el próximo viernes",

  "Pedido para María con 3 pinturas, entregar hoy",

  "Presupuesto para José con 5 cementos",
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

      deliveryDate: command.deliveryDate,
    },
    {
      depth: null,
    },
  );
}
