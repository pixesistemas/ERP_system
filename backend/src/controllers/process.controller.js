const ProcessEngine = require("../process/processEngine");

const {
  hashRequest,
  getIdempotency,
  saveIdempotency,
} = require("../repositories/idempotency.repository");

async function ejecutar(req, res, next) {
  try {
    const nombreProceso = String(req.params.proceso || "")
      .trim()
      .toUpperCase();

    const idempotencyKey = req.headers["idempotency-key"];

    if (!idempotencyKey) {
      return res.status(400).json({
        ok: false,
        error: "Falta header Idempotency-Key",
      });
    }

    const payload = {
      ...req.body,

      empresa: req.empresa.nombre,

      context: {
        usuarioId: req.usuario?.id || null,
        usuarioEmail: req.usuario?.email || null,
        empresaId: req.empresa.id,
        ip: req.ip,

        origen: req.originalUrl.includes("/whatsapp") ? "whatsapp" : "api",
      },
    };

    /*
     * Incluimos el proceso en el hash.
     * Así la misma clave no puede usarse para dos procesos distintos.
     */
    const requestHash = hashRequest({
      proceso: nombreProceso,
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
          error:
            "Idempotency-Key reutilizada con un proceso o contenido distinto",
        });
      }

      return res.json({
        ...JSON.parse(existing.response_json),
        idempotentReplay: true,
      });
    }

    const resultado = await ProcessEngine.execute(nombreProceso, payload);

    const response = {
      ok: true,
      proceso: nombreProceso,
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

function listar(req, res, next) {
  try {
    const procesos = ProcessEngine.list();

    res.json({
      ok: true,
      total: procesos.length,
      procesos,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  ejecutar,
  listar,
};
