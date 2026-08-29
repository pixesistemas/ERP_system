const assert = require("node:assert");

const CommercialParser = require("../../src/core/commercial-parser");

/*
 * Casos principales del Commercial Parser.
 */
const cases = [
  {
    message:
      "Haceme un presupuesto para José con 20 bolsas de cemento y 10 hierros del 8 contado",

    expected: {
      operation: "PRESUPUESTO",
      customer: "José",
      products: 2,
      paymentType: "CONTADO",
    },
  },

  {
    message:
      "Facturame a Juan por 5 cajas de tornillos en efectivo y descuento del 10%",

    expected: {
      operation: "FACTURA",
      customer: "Juan",
      products: 1,
      paymentType: "CONTADO",
      paymentMethod: "EFECTIVO",
      discount: 10,
    },
  },

  {
    message:
      "Nota de pedido para Construcciones Norte con 30 bolsas de cemento en cuenta corriente, entregar mañana",

    expected: {
      operation: "NOTA_PEDIDO",
      customer: "Construcciones Norte",
      products: 1,
      paymentType: "CUENTA_CORRIENTE",
      deliveryType: "RELATIVE",
    },
  },

  {
    message: "Facturá el presupuesto 354",

    expected: {
      operation: "FACTURA",
      sourceDocument: "PRESUPUESTO",
      documentNumber: 354,
    },
  },

  {
    message: "Generá una nota de crédito de la factura 0003-00001234",

    expected: {
      operation: "NOTA_CREDITO",
      sourceDocument: "FACTURA",
      pointOfSale: 3,
      documentNumber: 1234,
    },
  },

  {
    message: "Presupuesto para José con 10 hierros entregar el 25/07/2026",

    expected: {
      operation: "PRESUPUESTO",
      customer: "José",
      products: 1,
      deliveryDate: "2026-07-25",
    },
  },

  {
    message: "Factura para José con cal x10 contado",

    expected: {
      operation: "FACTURA",
      customer: "José",
      products: 1,
      paymentType: "CONTADO",
    },
  },

  {
    message: "Presupuesto para María con cal x10 kg y cemento x3",

    expected: {
      operation: "PRESUPUESTO",
      customer: "María",
      products: 2,
    },
  },
];

/*
 * Ejecuta todos los casos.
 */
for (const testCase of cases) {
  const command = CommercialParser.Parser.parse({
    message: testCase.message,
    channel: "WHATSAPP",
  });

  const plain = command.toPlainObject();

  console.log("\n================================");

  console.log(testCase.message);

  console.dir(plain, {
    depth: null,
  });

  console.dir(command.validation, {
    depth: null,
  });

  assert.strictEqual(command.operation, testCase.expected.operation);

  if (testCase.expected.customer) {
    assert.strictEqual(command.customer.text, testCase.expected.customer);
  }

  if (testCase.expected.products !== undefined) {
    assert.strictEqual(command.products.length, testCase.expected.products);
  }

  if (testCase.expected.paymentType) {
    assert.strictEqual(command.payment?.type, testCase.expected.paymentType);
  }

  if (testCase.expected.paymentMethod) {
    assert.strictEqual(
      command.payment?.method,
      testCase.expected.paymentMethod,
    );
  }

  if (testCase.expected.discount !== undefined) {
    assert.strictEqual(command.discount?.value, testCase.expected.discount);
  }

  if (testCase.expected.sourceDocument) {
    assert.strictEqual(
      command.sourceDocument?.type,
      testCase.expected.sourceDocument,
    );
  }

  if (testCase.expected.pointOfSale !== undefined) {
    assert.strictEqual(
      command.sourceDocument?.pointOfSale,
      testCase.expected.pointOfSale,
    );
  }

  if (testCase.expected.documentNumber !== undefined) {
    assert.strictEqual(
      command.sourceDocument?.number,
      testCase.expected.documentNumber,
    );
  }

  if (testCase.expected.deliveryType) {
    assert.strictEqual(
      command.deliveryDate?.type,
      testCase.expected.deliveryType,
    );
  }

  if (testCase.expected.deliveryDate) {
    assert.strictEqual(
      command.deliveryDate?.date,
      testCase.expected.deliveryDate,
    );
  }
}

console.log("\nCommercial Parser: todos los tests finalizaron correctamente.");
