const bcrypt = require("bcryptjs");
const db = require("../db/database");

function getSuperAdminByUsuario(usuario) {
  return db
    .prepare("SELECT * FROM super_admins WHERE usuario = ? AND activo = 1")
    .get(usuario);
}

function listarEmpresas() {
  return db
    .prepare(
      `
    SELECT e.*,
      (SELECT plan FROM licencias l
        WHERE l.empresa_id = e.id AND l.estado = 'ACTIVA'
        ORDER BY l.id DESC LIMIT 1) AS plan_activo,
      (SELECT fecha_vencimiento FROM licencias l
        WHERE l.empresa_id = e.id AND l.estado = 'ACTIVA'
        ORDER BY l.id DESC LIMIT 1) AS vencimiento_licencia
    FROM empresas e
    ORDER BY e.id
  `,
    )
    .all();
}

function crearEmpresa({ nombre, cuit, condicionIva, razonSocial, direccion, localidad, provincia, telefono, email, activa }) {
  const nombreOk = (nombre || "").trim();
  if (!nombreOk) {
    const error = new Error("El nombre de la empresa es obligatorio");
    error.statusCode = 400;
    throw error;
  }

  const insert = db.prepare(
    `INSERT INTO empresas
      (nombre, cuit, condicion_iva, punto_venta, production, cert_path, key_path, cache_path, activa,
       razon_social, direccion, localidad, provincia, telefono, email)
     VALUES (?, ?, ?, 1, 0, 'src/certificates/empresa1/cert.crt', 'src/certificates/empresa1/private.key',
       'src/cache/empresa1', ?, ?, ?, ?, ?, ?, ?)`,
  );

  let id;
  try {
    const res = insert.run(
      nombreOk,
      cuit || "",
      condicionIva || "MONOTRIBUTO",
      activa === undefined || activa === null || activa ? 1 : 0,
      razonSocial || nombreOk,
      direccion || null,
      localidad || null,
      provincia || null,
      telefono || null,
      email || null,
    );
    id = res.lastInsertRowid;
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      const err = new Error(`Ya existe una empresa con el nombre '${nombreOk}'`);
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO depositos (empresa_id, nombre, activo) VALUES (?, 'Depósito Principal', 1)").run(id);
    const dep = db.prepare("SELECT id FROM depositos WHERE empresa_id = ? AND nombre = 'Depósito Principal'").get(id);
    db.prepare("INSERT INTO sucursales (empresa_id, codigo, nombre, domicilio, deposito_id, activo) VALUES (?, 'CASA', 'Casa Central', ?, ?, 1)").run(id, direccion || null, dep ? dep.id : null);
    const suc = db.prepare("SELECT id FROM sucursales WHERE empresa_id = ? AND codigo = 'CASA'").get(id);
    db.prepare("INSERT INTO cajeros (empresa_id, codigo, nombre, usuario_id, activo) VALUES (?, 'CAJA1', 'Caja Principal', NULL, 1)").run(id);
    db.prepare("INSERT INTO puntos_venta (empresa_id, sucursal_id, numero, nombre, fiscal, activo) VALUES (?, ?, 1, 'Punto de venta 0001', 1, 1)").run(id, suc ? suc.id : null);
  });
  tx();

  return { id, nombre: nombreOk };
}

function actualizarEmpresa(id, { nombre, cuit, condicionIva, razonSocial, direccion, localidad, provincia, telefono, email, activa, puntoVenta, versionInstalada }) {
  const existe = db.prepare("SELECT id FROM empresas WHERE id = ?").get(id);
  if (!existe) {
    const error = new Error("Empresa no encontrada");
    error.statusCode = 404;
    throw error;
  }
  const actual = db.prepare("SELECT * FROM empresas WHERE id = ?").get(id);
  db.prepare(
    `UPDATE empresas SET
       nombre = ?, cuit = ?, condicion_iva = ?, razon_social = ?,
       direccion = ?, localidad = ?, provincia = ?, telefono = ?, email = ?,
       activa = ?, punto_venta = ?, version_instalada = ?
     WHERE id = ?`,
  ).run(
    nombre || actual.nombre,
    cuit !== undefined ? cuit : actual.cuit,
    condicionIva || actual.condicion_iva,
    razonSocial !== undefined ? razonSocial : actual.razon_social,
    direccion !== undefined ? direccion : actual.direccion,
    localidad !== undefined ? localidad : actual.localidad,
    provincia !== undefined ? provincia : actual.provincia,
    telefono !== undefined ? telefono : actual.telefono,
    email !== undefined ? email : actual.email,
    activa === undefined || activa === null || activa ? 1 : 0,
    puntoVenta !== undefined ? puntoVenta : actual.punto_venta,
    versionInstalada !== undefined ? String(versionInstalada).trim() : actual.version_instalada,
    id,
  );
  return db.prepare("SELECT * FROM empresas WHERE id = ?").get(id);
}

function listarUsuarios(empresaId) {
  const where = empresaId ? "AND ue.empresa_id = ?" : "";
  const params = empresaId ? [empresaId] : [];
  return db
    .prepare(
      `
    SELECT u.id, u.nombre, u.email, u.telefono, u.activo, u.created_at,
      GROUP_CONCAT(DISTINCT e.nombre) AS empresas,
      MAX(ue.empresa_id) AS empresa_id,
      (SELECT rol_id FROM usuario_roles ur WHERE ur.usuario_id = u.id LIMIT 1) AS rol_id
    FROM usuarios u
    LEFT JOIN usuario_empresas ue ON ue.usuario_id = u.id AND ue.activo = 1
    LEFT JOIN empresas e ON e.id = ue.empresa_id
    WHERE 1 = 1 ${where}
    GROUP BY u.id
    ORDER BY u.id
  `,
    )
    .all(...params);
}

function crearUsuario({ nombre, email, password, empresaId, rol }) {
  const nombreOk = (nombre || "").trim();
  if (!nombreOk || !email || !password) {
    const error = new Error("Nombre, email y clave son obligatorios");
    error.statusCode = 400;
    throw error;
  }
  if (rol !== 1 && rol !== 3) {
    const error = new Error("El rol debe ser ADMIN (1) o VENDEDOR (3)");
    error.statusCode = 400;
    throw error;
  }
  const empresa = db.prepare("SELECT id FROM empresas WHERE id = ?").get(empresaId);
  if (!empresa) {
    const error = new Error("Empresa no encontrada");
    error.statusCode = 400;
    throw error;
  }

  const hash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    let usuarioId;
    const existente = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(email);
    if (existente) {
      db.prepare("UPDATE usuarios SET nombre = ?, password_hash = ?, activo = 1 WHERE id = ?").run(nombreOk, hash, existente.id);
      usuarioId = existente.id;
    } else {
      const res = db.prepare("INSERT INTO usuarios (nombre, email, password_hash, activo) VALUES (?, ?, ?, 1)").run(nombreOk, email, hash);
      usuarioId = res.lastInsertRowid;
    }
    db.prepare(
      "INSERT INTO usuario_empresas (usuario_id, empresa_id, activo) VALUES (?, ?, 1) ON CONFLICT(usuario_id, empresa_id) DO UPDATE SET activo = 1",
    ).run(usuarioId, empresaId);
    const rolActual = db.prepare("SELECT id FROM usuario_roles WHERE usuario_id = ? AND empresa_id = ? AND rol_id = ?").get(usuarioId, empresaId, rol);
    if (!rolActual) {
      db.prepare("INSERT INTO usuario_roles (usuario_id, empresa_id, rol_id) VALUES (?, ?, ?)").run(usuarioId, empresaId, rol);
    }
    return usuarioId;
  });

  const usuarioId = tx();
  return db.prepare("SELECT id, nombre, email FROM usuarios WHERE id = ?").get(usuarioId);
}

function actualizarUsuario(id, { nombre, email, password, activo, empresaId, rol }) {
  const existe = db.prepare("SELECT id, email FROM usuarios WHERE id = ?").get(id);
  if (!existe) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }

  const tx = db.transaction(() => {
    if (nombre !== undefined && String(nombre).trim()) {
      db.prepare("UPDATE usuarios SET nombre = ? WHERE id = ?").run(String(nombre).trim(), id);
    }
    if (email !== undefined && String(email).trim() && String(email).trim() !== existe.email) {
      const nuevoEmail = String(email).trim();
      const dup = db
        .prepare("SELECT id FROM usuarios WHERE email = ? AND id <> ?")
        .get(nuevoEmail, id);
      if (dup) {
        const error = new Error("Ya existe otro usuario con ese email");
        error.statusCode = 409;
        throw error;
      }
      db.prepare("UPDATE usuarios SET email = ? WHERE id = ?").run(nuevoEmail, id);
    }
    if (activo !== undefined) {
      db.prepare("UPDATE usuarios SET activo = ? WHERE id = ?").run(activo ? 1 : 0, id);
    }
    if (password) {
      db.prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), id);
    }
    // Reasignar a otra empresa: deja activa solo la nueva.
    if (empresaId) {
      const empresa = db.prepare("SELECT id FROM empresas WHERE id = ?").get(Number(empresaId));
      if (!empresa) {
        const error = new Error("Empresa no encontrada");
        error.statusCode = 400;
        throw error;
      }
      db.prepare("UPDATE usuario_empresas SET activo = 0 WHERE usuario_id = ?").run(id);
      db.prepare(
        "INSERT INTO usuario_empresas (usuario_id, empresa_id, activo) VALUES (?, ?, 1) ON CONFLICT(usuario_id, empresa_id) DO UPDATE SET activo = 1",
      ).run(id, Number(empresaId));
      if (rol !== undefined && rol !== null && rol !== "") {
        db.prepare("DELETE FROM usuario_roles WHERE usuario_id = ?").run(id);
        db.prepare("INSERT INTO usuario_roles (usuario_id, empresa_id, rol_id) VALUES (?, ?, ?)").run(
          id,
          Number(empresaId),
          Number(rol),
        );
      }
    }
  });

  tx();
  return db
    .prepare(
      `SELECT u.id, u.nombre, u.email, u.activo,
        MAX(ue.empresa_id) AS empresa_id,
        (SELECT rol_id FROM usuario_roles ur WHERE ur.usuario_id = u.id LIMIT 1) AS rol_id
       FROM usuarios u
       LEFT JOIN usuario_empresas ue ON ue.usuario_id = u.id AND ue.activo = 1
       WHERE u.id = ? GROUP BY u.id`,
    )
    .get(id);
}

function listarLicencias(empresaId) {
  const where = empresaId ? "WHERE l.empresa_id = ?" : "";
  const params = empresaId ? [empresaId] : [];
  return db
    .prepare(
      `
    SELECT l.*, e.nombre AS empresa_nombre
    FROM licencias l
    INNER JOIN empresas e ON e.id = l.empresa_id
    ${where}
    ORDER BY l.id DESC
  `,
    )
    .all(...params);
}

function crearLicencia({ empresaId, plan, precio, descuentoPorc, fechaInicio, notas }) {
  const empresa = db.prepare("SELECT id FROM empresas WHERE id = ?").get(empresaId);
  if (!empresa) {
    const error = new Error("Empresa no encontrada");
    error.statusCode = 400;
    throw error;
  }
  if (!["MENSUAL", "TRIMESTRAL", "DEFINITIVO"].includes(plan)) {
    const error = new Error("El plan debe ser MENSUAL, TRIMESTRAL o DEFINITIVO");
    error.statusCode = 400;
    throw error;
  }

  const precioNum = Number(precio) || 0;
  const descuentoNum = Math.min(100, Math.max(0, Number(descuentoPorc) || 0));
  const total = Math.round(precioNum * (1 - descuentoNum / 100) * 100) / 100;

  let fechaVencimiento = null;
  if (plan !== "DEFINITIVO") {
    const inicio = fechaInicio ? new Date(fechaInicio) : new Date();
    const meses = plan === "MENSUAL" ? 1 : 3;
    const venc = new Date(inicio);
    venc.setMonth(venc.getMonth() + meses);
    fechaVencimiento = venc.toISOString().slice(0, 10);
  }

  const res = db
    .prepare(
      `INSERT INTO licencias
        (empresa_id, plan, precio, descuento_porc, total, fecha_inicio, fecha_vencimiento, estado, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVA', ?)`,
    )
    .run(
      empresaId,
      plan,
      precioNum,
      descuentoNum,
      total,
      (fechaInicio || new Date().toISOString().slice(0, 10)),
      fechaVencimiento,
      notas || null,
    );

  return db
    .prepare(
      `SELECT l.*, e.nombre AS empresa_nombre
       FROM licencias l INNER JOIN empresas e ON e.id = l.empresa_id
       WHERE l.id = ?`,
    )
    .get(res.lastInsertRowid);
}

function cambiarEstadoLicencia(id, estado) {
  if (!["ACTIVA", "VENCIDA", "CANCELADA"].includes(estado)) {
    const error = new Error("Estado inválido");
    error.statusCode = 400;
    throw error;
  }
  const res = db.prepare("UPDATE licencias SET estado = ? WHERE id = ?").run(estado, id);
  if (res.changes === 0) {
    const error = new Error("Licencia no encontrada");
    error.statusCode = 404;
    throw error;
  }
  return db.prepare("SELECT * FROM licencias WHERE id = ?").get(id);
}

module.exports = {
  getSuperAdminByUsuario,
  listarEmpresas,
  crearEmpresa,
  actualizarEmpresa,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  listarLicencias,
  crearLicencia,
  cambiarEstadoLicencia,
};