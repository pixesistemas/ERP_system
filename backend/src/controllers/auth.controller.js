const AuthService = require("../services/auth.service");
const { getPantallasUsuario } = require("../repositories/rol.repository");
const passwordRecovery = require("../services/passwordRecovery.service");
const db = require("../db/database");

function getPuntosVentaUsuario(usuarioId, empresaId) {
  const rows = db
    .prepare(
      `SELECT up.punto_venta_id,p.numero,p.nombre,up.predeterminado
       FROM usuario_puntos_venta up
       JOIN puntos_venta p ON p.id=up.punto_venta_id AND p.empresa_id=up.empresa_id
       WHERE up.empresa_id=? AND up.usuario_id=?
       ORDER BY p.numero`,
    )
    .all(empresaId, usuarioId);

  if (rows.length) {
    return rows;
  }

  return db
    .prepare(
      "SELECT id punto_venta_id,numero,nombre,0 predeterminado FROM puntos_venta WHERE empresa_id=? AND activo=1 ORDER BY numero",
    )
    .all(empresaId);
}

function getModulosEmpresa(empresaId) {
  const rows = db
    .prepare(
      "SELECT modulo FROM modulos_empresa WHERE empresa_id=? AND activo=1",
    )
    .all(empresaId);
  return Object.fromEntries(rows.map((r) => [r.modulo, true]));
}

function login(req, res, next) {
  try {
    const result = AuthService.login({
      email: req.body.email,
      password: req.body.password,
      empresaNombre: req.body.empresa || undefined,
      empresaId: req.body.empresaId || undefined,
    });

    if (result.requiereEmpresa) {
      return res.json({
        ok: true,
        requiereEmpresa: true,
        empresas: result.empresas,
      });
    }

    const pantallas = getPantallasUsuario({
      usuarioId: result.usuario.id,
      empresaId: result.empresa.id,
    });

    res.json({
      ok: true,
      ...result,
      pantallas,
      modulos: getModulosEmpresa(result.empresa.id),
    });
  } catch (error) {
    next(error);
  }
}
function me(req, res, next) {
  try {
    const pantallas = getPantallasUsuario({
      usuarioId: req.usuario.id,
      empresaId: req.empresa.id,
    });

    res.json({
      ok: true,
      usuario: {
        id: req.usuario.id,
        nombre: req.usuario.nombre,
        email: req.usuario.email,
        puntosVenta: getPuntosVentaUsuario(req.usuario.id, req.empresa.id),
      },
      empresa: {
        id: req.empresa.id,
        nombre: req.empresa.nombre,
        tema: req.empresa.tema || "lavanda",
      },
      permisos: req.permisos || [],
      pantallas,
      modulos: getModulosEmpresa(req.empresa.id),
    });
  } catch (error) {
    next(error);
  }
}
function refresh(req, res, next) {
  try {
    const result = AuthService.refresh({
      refreshToken: req.body.refreshToken,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
function logout(req, res, next) {
  try {
    const result = AuthService.logout({
      refreshToken: req.body.refreshToken,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function recuperarClave(req, res, next) {
  try {
    const result = await passwordRecovery.solicitarUsuario(req.body?.email);
    res.json({
      ok: true,
      mensaje:
        "Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.",
      ...(result.link && process.env.NODE_ENV !== "production"
        ? { link: result.link }
        : {}),
    });
  } catch (error) {
    next(error);
  }
}

function restablecerClave(req, res, next) {
  try {
    const result = passwordRecovery.restablecer({
      token: req.body?.token,
      password: req.body?.password,
    });
    res.json({ ok: true, ...result, mensaje: "Contraseña actualizada." });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  me,
  refresh,
  logout,
  recuperarClave,
  restablecerClave,
};
