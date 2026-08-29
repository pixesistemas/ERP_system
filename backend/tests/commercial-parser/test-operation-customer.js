const CommercialParser = require("../../src/core/commercial-parser");

/*
 * Mensajes utilizados para verificar
 * la operación y el cliente detectados.
 */
const messages = [
  "Haceme un presupuesto para José",
  "Presupuesto para Ferretería López por 10 cementos",
  "Facturame a AVA JOSE contado",
  "Crear remito para Juan Pérez",
  "Nota de pedido para Construcciones Norte",
  "Mensaje sin operación comercial",
];

for (const message of messages) {
  const command = CommercialParser.Parser.parse({
    message,
    channel: "WHATSAPP",
  });

  console.log("\nMensaje:", message);

  console.dir(
    {
      operation: command.operation,
      customer: command.customer,
      channel: command.channel,
    },
    {
      depth: null,
    },
  );
}
