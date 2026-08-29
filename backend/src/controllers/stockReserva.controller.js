const { getDepositoPrincipal } = require("../repositories/stock.repository");

const {
  crearReserva,
  listarReservas,
  cancelarReserva,
  consumirReserva,
} = require("../repositories/stockReserva.repository");

function crear(req, res, next) {
  try {
    const deposito = getDepositoPrincipal(req.empresa.id);

    if (!deposito) {
      return res.status(400).json({
        ok: false,
        error: "No existe depósito principal",
      });
    }

    const { productoId, cantidad, documentoTipo, documentoId, observaciones } =
      req.body;

    if (!productoId || !cantidad) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar productoId y cantidad",
      });
    }

    const reserva = crearReserva({
      empresaId: req.empresa.id,
      depositoId: deposito.id,
      productoId,
      cantidad,
      documentoTipo: documentoTipo || null,
      documentoId: documentoId || null,
      observaciones: observaciones || null,
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      reserva,
    });
  } catch (error) {
    next(error);
  }
}

function listar(req, res, next) {
  try {
    const reservas = listarReservas({
      empresaId: req.empresa.id,
      estado: req.query.estado || "ACTIVA",
    });

    res.json({
      ok: true,
      total: reservas.length,
      reservas,
    });
  } catch (error) {
    next(error);
  }
}

function cancelar(req, res, next) {
  try {
    const reserva = cancelarReserva({
      reservaId: req.params.id,
      empresaId: req.empresa.id,
    });

    res.json({
      ok: true,
      reserva,
    });
  } catch (error) {
    next(error);
  }
}

function consumir(req, res, next) {
  try {
    const reserva = consumirReserva({
      reservaId: req.params.id,
      empresaId: req.empresa.id,
    });

    res.json({
      ok: true,
      reserva,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  crear,
  listar,
  cancelar,
  consumir,
};
