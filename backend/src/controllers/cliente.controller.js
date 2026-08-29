const {
  listarClientes,
  saveCliente,
  getClienteById,
  updateCliente,
  deleteCliente,
} = require("../repositories/cliente.repository");

/* Lista clientes de la empresa autenticada. */
function listar(req, res, next) {
  try {
    const limit = Number(req.query.limit || (req.query.q ? 30 : 500));
    const clientes = listarClientes({
      empresaId: req.empresa.id,
      texto: req.query.q || "",
      limit,
    });

    res.json({ ok: true, total: clientes.length, clientes });
  } catch (error) {
    next(error);
  }
}

/* Crea un cliente para usarlo desde POS, chat y WhatsApp. */
function crear(req, res, next) {
  try {
    const razonSocial = String(req.body.razonSocial || "").trim();
    if (!razonSocial) {
      return res.status(400).json({ ok: false, error: "Debe informar razón social" });
    }

    const cliente = saveCliente({
      ...req.body,
      empresaId: req.empresa.id,
      razonSocial,
    });

    res.status(201).json({ ok: true, cliente });
  } catch (error) {
    next(error);
  }
}

/* Devuelve un cliente puntual. */
function obtener(req, res, next) {
  try {
    const cliente = getClienteById(Number(req.params.id));
    if (!cliente || Number(cliente.empresaId) !== Number(req.empresa.id)) {
      return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    }
    res.json({ ok: true, cliente });
  } catch (error) {
    next(error);
  }
}

function actualizar(req, res, next) {
  try {
    const cliente = updateCliente(Number(req.params.id), req.empresa.id, req.body || {});
    res.json({ ok: true, cliente });
  } catch (error) { next(error); }
}

function eliminar(req, res, next) {
  try {
    deleteCliente(Number(req.params.id), req.empresa.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
}

module.exports = { listar, crear, obtener, actualizar, eliminar };
