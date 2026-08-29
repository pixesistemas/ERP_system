const MessageParser = require("../../src/core/conversation/messageParser");

/*
 * Casos utilizados para verificar
 * la extracción básica de cantidades.
 */
const messages = [
  "20 bolsas de cemento",
  "10 hierros del 8",
  "3 unidades de pintura blanca",
  "2,5 kilos de tornillos",
  "cemento",
  "agregá 5 cajas de cerámicos",
];

for (const message of messages) {
  console.log(message, "=>", MessageParser.parseProductMessage(message));
}
