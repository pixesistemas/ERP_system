const ProcessEngine = require("../process/processEngine");

const {
  hashRequest,
  getIdempotency,
  saveIdempotency,
} = require("../repositories/idempotency.repository");

async function ejecutar(req, res, next) {
  try {
    const proceso = String(req.params.proceso || "")
      .trim()
      .toUpperCase();

    const idempotencyKey = req.headers["idempotency-key"];

    if (!idempotencyKey) {
      return res.status(400).json({
        ok: false,
        error: "Falta header Idempotency-Key",
      });
    }

    if (!proceso) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar el proceso",
      });
    }

    const payload = {
      ...req.body,

      empresa: req.empresa.nombre,

      telefonoOrigen: req.whatsapp?.telefono || null,

      context: {
        empresaId: req.empresa.id,

        usuarioId: req.usuario?.id || null,

        usuarioEmail: req.usuario?.email || null,

        telefonoOrigen: req.whatsapp?.telefono || null,

        ip: req.ip,
        origen: "whatsapp",
      },
    };

    const requestHash = hashRequest({
      proceso,
      payload,
    });

    const existing = getIdempotency({
      empresaId: req.empresa.id,
      key: idempotencyKey,
    });

    if (existing) {
      if (existing.request_hash !== requestHash) {
        return res.status(409).json({
          ok: false,
          error: "Idempotency-Key reutilizada con datos diferentes",
        });
      }

      return res.json({
        ...JSON.parse(existing.response_json),
        idempotentReplay: true,
      });
    }

    const resultado = await ProcessEngine.execute(proceso, payload);

    const response = {
      ok: true,
      canal: "WHATSAPP",
      proceso,
      telefonoOrigen: req.whatsapp?.telefono || null,
      resultado,
      idempotentReplay: false,
    };

    saveIdempotency({
      empresaId: req.empresa.id,
      key: idempotencyKey,
      requestHash,
      response,
    });

    return res.json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  ejecutar,
};
