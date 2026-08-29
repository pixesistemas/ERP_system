const Parser = require("../../src/core/commercial-parser");

const cmd = Parser.Parser.parse({
  message: "Haceme un presupuesto para José",

  channel: "WHATSAPP",
});

console.dir(cmd, { depth: null });
