const {
  listRoles,
  crearRol,
  eliminarRol,
  getPantallasRol,
  setPantallasRol,
} = require("../repositories/rol.repository");

function listar(req, res, next) {
  try {
    const roles = listRoles().map((rol) => ({
      ...rol,
      pantallas: getPantallasRol(rol.id),
    }));

    res.json({ ok: true, roles });
  } catch (error) {
    next(error);
  }
}

function crear(req, res, next) {
  try {
    const rol = crearRol({
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
    });

    res.json({ ok: true, rol });
  } catch (error) {
    next(error);
  }
}

function eliminar(req, res, next) {
  try {
    eliminarRol(Number(req.params.id));

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

function guardarPantallas(req, res, next) {
  try {
    const pantallas = setPantallasRol({
      rolId: Number(req.params.id),
      pantallas: Array.isArray(req.body.pantallas) ? req.body.pantallas : [],
    });

    res.json({ ok: true, pantallas });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listar,
  crear,
  eliminar,
  guardarPantallas,
};
