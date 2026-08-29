const { listEvents } = require("../repositories/eventStore.repository");

function listar(req, res, next) {
  try {
    const events = listEvents({
      empresaId: req.empresa.id,
      limit: req.query.limit || 100,
    });

    res.json({
      ok: true,
      total: events.length,
      events,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listar,
};
