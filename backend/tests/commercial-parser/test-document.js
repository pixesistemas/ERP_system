const CommercialParser = require("../../src/core/commercial-parser");

/*
 * Casos utilizados para comprobar
 * referencias a documentos de origen.
 */
const messages = [
  "Facturá el presupuesto 354",

  "Convertí el remito 25 en factura",

  "Facturá el presupuesto 0002-00000354",

  "Generá una nota de crédito de la factura 0003-00001234",

  "Hacé un remito desde la nota de pedido 82",

  "Crear factura para José con 10 cementos",
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
      sourceDocument: command.sourceDocument,
    },
    {
      depth: null,
    },
  );
}
