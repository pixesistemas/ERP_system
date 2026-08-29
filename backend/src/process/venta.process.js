const BillingEngine = require("../billing/billingEngine");

async function ventaProcess(payload) {
  return await BillingEngine.emitirFactura(payload);
}

module.exports = ventaProcess;
