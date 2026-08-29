const {
  listSolicitudes,
  aprobarSolicitud,
  rechazarSolicitud,
  reactivarSolicitud,
} = require("../repositories/whatsappCliente.repository");

function listar(req, res, next) {
  try {
    const solicitudes = listSolicitudes({
      empresaId: req.empresa.id,
      estado: req.query.estado || null,
    });

    res.json({ ok: true, solicitudes });
  } catch (error) {
    next(error);
  }
}

function aprobar(req, res, next) {
  try {
    const solicitud = aprobarSolicitud({
      empresaId: req.empresa.id,
      solicitudId: Number(req.params.id),
      clienteId: req.body.clienteId || null,
      datosClienteNuevo: req.body.clienteNuevo || null,
    });

    res.json({ ok: true, solicitud });
  } catch (error) {
    next(error);
  }
}

function rechazar(req, res, next) {
  try {
    rechazarSolicitud({
      empresaId: req.empresa.id,
      solicitudId: Number(req.params.id),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

function reactivar(req, res, next) {
  try {
    reactivarSolicitud({
      empresaId: req.empresa.id,
      solicitudId: Number(req.params.id),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

module.exports = { listar, aprobar, rechazar, reactivar };
