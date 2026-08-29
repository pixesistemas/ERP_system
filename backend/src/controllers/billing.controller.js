const BillingEngine = require("../billing/billingEngine");
const {
  hashRequest,
  getIdempotency,
  saveIdempotency,
} = require("../repositories/idempotency.repository");

async function emitirFactura(req, res, next) {
  try {
    const idempotencyKey = req.headers["idempotency-key"];

    const data = {
      ...req.body,
      empresa: req.empresa.nombre,
      context: {
        usuarioId: req.usuario?.id,
        usuarioEmail: req.usuario?.email,
        ip: req.ip,
        origen: req.originalUrl.includes("/whatsapp") ? "whatsapp" : "api",
      },
    };

    if (idempotencyKey) {
      const requestHash = hashRequest(data);

      const existing = getIdempotency({
        empresaId: req.empresa.id,
        key: idempotencyKey,
      });

      if (existing) {
        if (existing.request_hash !== requestHash) {
          return res.status(409).json({
            ok: false,
            error: "Idempotency-Key reutilizada con un request distinto",
          });
        }

        return res.json(JSON.parse(existing.response_json));
      }

      const result = await BillingEngine.emitirFactura(data);

      saveIdempotency({
        empresaId: req.empresa.id,
        key: idempotencyKey,
        requestHash,
        response: result,
      });

      return res.json(result);
    }

    const result = await BillingEngine.emitirFactura(data);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  emitirFactura,
};
