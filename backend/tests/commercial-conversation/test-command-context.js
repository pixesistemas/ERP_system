const assert = require("node:assert");

const CommercialConversation = require("../../src/core/commercial-conversation");

/*
 * Verifica la creación de contextos sin tocar
 * la base de datos ni WorkspaceEngine.
 */
const cases = [
  {
    message: "Haceme un presupuesto para José con 10 hierros",

    expected: {
      operation: "PRESUPUESTO",
      customer: "José",
      products: 1,
      state: "WAITING_CONFIRMATION",
    },
  },

  {
    message: "Quiero hacer un presupuesto",

    expected: {
      operation: "PRESUPUESTO",
      customer: null,
      products: 0,
      state: "WAITING_CUSTOMER",
    },
  },

  {
    message: "10 bolsas de cemento",

    expected: {
      operation: "UNKNOWN",
      customer: null,
      products: 1,
      state: "WAITING_OPERATION",
    },
  },

  {
    message: "Facturá el presupuesto 354",

    expected: {
      operation: "FACTURA",
      sourceDocument: "PRESUPUESTO",
      state: "WAITING_CONFIRMATION",
    },
  },
];

/*
 * Ejecuta los casos del contexto.
 */
for (const testCase of cases) {
  const context = CommercialConversation.Engine.start({
    message: testCase.message,

    channel: "WHATSAPP",
  });

  console.log("\n================================");

  console.log(testCase.message);

  console.dir(context.toPlainObject(), {
    depth: null,
  });

  assert.strictEqual(context.command.operation, testCase.expected.operation);

  /*
   * Solo valida el cliente cuando el caso
   * define explícitamente un valor esperado.
   */
  if (Object.prototype.hasOwnProperty.call(testCase.expected, "customer")) {
    assert.strictEqual(
      context.command.customer.text,
      testCase.expected.customer,
    );
  }

  if (testCase.expected.products !== undefined) {
    assert.strictEqual(
      context.command.products.length,
      testCase.expected.products,
    );
  }

  if (testCase.expected.sourceDocument) {
    assert.strictEqual(
      context.command.sourceDocument?.type,

      testCase.expected.sourceDocument,
    );
  }

  assert.strictEqual(context.state, testCase.expected.state);
}

console.log("\nCommercial Conversation Context: tests correctos.");
