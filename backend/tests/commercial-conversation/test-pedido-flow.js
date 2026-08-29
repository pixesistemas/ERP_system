const assert = require("node:assert");

const CommercialConversation = require("../../src/core/commercial-conversation");

/*
 * Regresión del flujo conversacional por WhatsApp:
 * "pedido" (la palabra que invita el bot) debe transicionar
 * de ASK_OPERATION a ASK_CUSTOMER y avanzar con el cliente.
 */
const cases = [
  {
    message: "pedido",
    expected: { operation: "NOTA_PEDIDO", state: "WAITING_CUSTOMER" },
  },

  {
    message: "quiero un pedido",
    expected: { operation: "NOTA_PEDIDO", state: "WAITING_CUSTOMER" },
  },

  {
    message: "me haces un pedido",
    expected: { operation: "NOTA_PEDIDO", state: "WAITING_CUSTOMER" },
  },

  {
    message: "un pedido por favor",
    expected: { operation: "NOTA_PEDIDO", state: "WAITING_CUSTOMER" },
  },

  {
    message: "nota de pedido",
    expected: { operation: "NOTA_PEDIDO", state: "WAITING_CUSTOMER" },
  },

  {
    message: "presupuesto",
    expected: { operation: "PRESUPUESTO", state: "WAITING_CUSTOMER" },
  },

  {
    message: "factura",
    expected: { operation: "FACTURA", state: "WAITING_CUSTOMER" },
  },

  {
    message: "remito",
    expected: { operation: "REMITO", state: "WAITING_CUSTOMER" },
  },

  {
    message: "pido factura",
    expected: { operation: "FACTURA", state: "WAITING_CUSTOMER" },
  },
];

for (const testCase of cases) {
  const context = CommercialConversation.Engine.start({
    message: testCase.message,
    channel: "WHATSAPP",
  });

  console.log("\n================================");
  console.log(testCase.message);

  assert.strictEqual(
    context.command.operation,
    testCase.expected.operation,
    `operación incorrecta para "${testCase.message}"`,
  );

  assert.strictEqual(
    context.state,
    testCase.expected.state,
    `estado incorrecto para "${testCase.message}"`,
  );
}

/*
 * Segundo mensaje: el usuario responde "pedido" cuando el bot
 * recién preguntó la operación (la invitación misma del bot).
 */
async function run() {
  const continued = await CommercialConversation.Engine.continue({
    context: CommercialConversation.Engine.start({
      message: "pedido",
      channel: "WHATSAPP",
    }),
    message: "pedido",
    channel: "WHATSAPP",
    empresaId: 1,
    usuarioId: 1,
  });

  assert.strictEqual(
    continued.context.state,
    'WAITING_CUSTOMER',
    'el segundo mensaje "pedido" debe avanzar a pedir el cliente',
  );

  console.log("\nFlujo 'pedido' (1º y 2º mensaje): correcto.");
  console.log("\nConversación comercial 'pedido': tests correctos.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
