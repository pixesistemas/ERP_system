const {
  crearUsuario,
  listUsuariosByEmpresa,
  setUsuarioActivo,
  cambiarRolUsuario,
} = require("../repositories/usuario.repository");

const db = require("../db/database");

function crear(req, res, next) {
  try {
    const { nombre, email, telefono, password, rol } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar nombre, email y password",
      });
    }

    const usuario = crearUsuario({
      nombre,
      email,
      telefono,
      password,
      empresaId: req.empresa.id,
      rolNombre: rol || "ADMIN",
    });

    res.json({
      ok: true,
      usuario,
    });
  } catch (error) {
    next(error);
  }
}

function listar(req, res, next) {
  try {
    const usuarios = listUsuariosByEmpresa(req.empresa.id);

    res.json({
      ok: true,
      total: usuarios.length,
      usuarios,
    });
  } catch (error) {
    next(error);
  }
}
function activarDesactivar(req, res, next) {
  try {
    const usuario = setUsuarioActivo({
      usuarioId: req.params.id,
      activo: req.body.activo,
    });

    res.json({ ok: true, usuario });
  } catch (error) {
    next(error);
  }
}

function cambiarRol(req, res, next) {
  try {
    const usuario = cambiarRolUsuario({
      usuarioId: req.params.id,
      empresaId: req.empresa.id,
      rolNombre: req.body.rol,
    });

    res.json({ ok: true, usuario });
  } catch (error) {
    next(error);
  }
}

/*
 * Puntos de venta asignados a un usuario (con el predeterminado).
 * El POS usa esta lista para que cada operador facture solo en sus
 * puntos de venta y arranque con el predeterminado.
 */
function listarPuntosVenta(req, res, next) {
  try {
    const usuarioId = Number(req.params.id);

    const rows = db
      .prepare(
        `SELECT up.punto_venta_id,p.numero,p.nombre,up.predeterminado
         FROM usuario_puntos_venta up
         JOIN puntos_venta p ON p.id=up.punto_venta_id AND p.empresa_id=up.empresa_id
         WHERE up.empresa_id=? AND up.usuario_id=?
         ORDER BY p.numero`,
      )
      .all(req.empresa.id, usuarioId);

    res.json({ ok: true, puntosVenta: rows });
  } catch (error) {
    next(error);
  }
}

function guardarPuntosVenta(req, res, next) {
  try {
    const usuarioId = Number(req.params.id);

    const asignados = Array.isArray(req.body.asignados)
      ? Array.from(new Set(req.body.asignados.map(Number).filter(Boolean)))
      : [];

    const predeterminado = Number(req.body.predeterminado) || null;

    if (predeterminado && !asignados.includes(predeterminado)) {
      return res.status(400).json({
        ok: false,
        error: "El punto de venta predeterminado debe estar entre los asignados.",
      });
    }

    const validos = new Set(
      db
        .prepare(
          "SELECT id FROM puntos_venta WHERE empresa_id=? AND activo=1",
        )
        .all(req.empresa.id)
        .map((r) => r.id),
    );

    const invalido = asignados.find((id) => !validos.has(id));

    if (invalido) {
      return res.status(400).json({
        ok: false,
        error: `El punto de venta ${invalido} no existe o está inactivo.`,
      });
    }

    const tx = db.transaction(() => {
      db.prepare(
        "DELETE FROM usuario_puntos_venta WHERE empresa_id=? AND usuario_id=?",
      ).run(req.empresa.id, usuarioId);

      const ins = db.prepare(
        "INSERT INTO usuario_puntos_venta(empresa_id,usuario_id,punto_venta_id,predeterminado) VALUES(?,?,?,?)",
      );

      for (const id of asignados) {
        ins.run(req.empresa.id, usuarioId, id, id === predeterminado ? 1 : 0);
      }
    });

    tx();

    res.json({
      ok: true,
      puntosVenta: asignados.map((id) => ({
        punto_venta_id: id,
        predeterminado: id === predeterminado ? 1 : 0,
      })),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  crear,
  listar,
  activarDesactivar,
  cambiarRol,
  listarPuntosVenta,
  guardarPuntosVenta,
};
