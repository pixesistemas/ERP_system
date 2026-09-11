const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const repo = require("../repositories/superadmin.repository");
const passwordRecovery = require("../services/passwordRecovery.service");

function loginSuperAdmin(req, res, next) {
  try {
    const { usuario, password } = req.body || {};
    if (!usuario || !password) {
      return res.status(400).json({ ok: false, error: "Usuario y clave son obligatorios" });
    }

    const sa = repo.getSuperAdminByUsuario(String(usuario).trim());
    if (!sa || !bcrypt.compareSync(password, sa.password_hash || "")) {
      return res.status(401).json({ ok: false, error: "Usuario o clave inválidos" });
    }

    const token = jwt.sign(
      { role: "SUPERADMIN", saId: sa.id, usuario: sa.usuario, nombre: sa.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    return res.json({
      ok: true,
      token,
      superadmin: { id: sa.id, usuario: sa.usuario, nombre: sa.nombre },
    });
  } catch (e) {
    next(e);
  }
}

function listarEmpresas(req, res, next) {
  try {
    return res.json({ ok: true, empresas: repo.listarEmpresas() });
  } catch (e) {
    next(e);
  }
}

function crearEmpresa(req, res, next) {
  try {
    const empresa = repo.crearEmpresa(req.body || {});
    return res.status(201).json({ ok: true, empresa });
  } catch (e) {
    next(e);
  }
}

function actualizarEmpresa(req, res, next) {
  try {
    const empresa = repo.actualizarEmpresa(Number(req.params.id), req.body || {});
    return res.json({ ok: true, empresa });
  } catch (e) {
    next(e);
  }
}

function listarUsuarios(req, res, next) {
  try {
    const { empresaId } = req.query;
    return res.json({ ok: true, usuarios: repo.listarUsuarios(empresaId ? Number(empresaId) : null) });
  } catch (e) {
    next(e);
  }
}

function crearUsuario(req, res, next) {
  try {
    const usuario = repo.crearUsuario(req.body || {});
    return res.status(201).json({ ok: true, usuario });
  } catch (e) {
    next(e);
  }
}

function actualizarUsuario(req, res, next) {
  try {
    const usuario = repo.actualizarUsuario(Number(req.params.id), req.body || {});
    return res.json({ ok: true, usuario });
  } catch (e) {
    next(e);
  }
}

function listarLicencias(req, res, next) {
  try {
    const { empresaId } = req.query;
    return res.json({ ok: true, licencias: repo.listarLicencias(empresaId ? Number(empresaId) : null) });
  } catch (e) {
    next(e);
  }
}

function crearLicencia(req, res, next) {
  try {
    const licencia = repo.crearLicencia(req.body || {});
    return res.status(201).json({ ok: true, licencia });
  } catch (e) {
    next(e);
  }
}

function cambiarEstadoLicencia(req, res, next) {
  try {
    const licencia = repo.cambiarEstadoLicencia(Number(req.params.id), req.body?.estado);
    return res.json({ ok: true, licencia });
  } catch (e) {
    next(e);
  }
}

function listarModulosEmpresa(req, res, next) {
  try {
    const db = require("../db/database");
    const rows = db
      .prepare("SELECT modulo,activo,updated_at FROM modulos_empresa WHERE empresa_id=? ORDER BY modulo")
      .all(Number(req.params.id));
    return res.json({ ok: true, modulos: rows });
  } catch (e) {
    next(e);
  }
}

function setModuloEmpresa(req, res, next) {
  try {
    const db = require("../db/database");
    const empresaId = Number(req.params.id);
    const modulo = String(req.body?.modulo || "").trim().toUpperCase();
    const activo = req.body?.activo === true || req.body?.activo === 1 || req.body?.activo === "1";
    if (!modulo) return res.status(400).json({ ok: false, error: "Falta el módulo." });
    db.prepare(
      `INSERT INTO modulos_empresa(empresa_id,modulo,activo,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(empresa_id,modulo) DO UPDATE SET activo=excluded.activo,updated_at=CURRENT_TIMESTAMP`,
    ).run(empresaId, modulo, activo ? 1 : 0);
    return res.json({ ok: true, modulo, activo });
  } catch (e) {
    next(e);
  }
}

function getTemaEmpresa(req, res, next) {
  try {
    const db = require("../db/database");
    const row = db.prepare("SELECT tema FROM empresas WHERE id=?").get(Number(req.params.id));
    if (!row) return res.status(404).json({ ok: false, error: "Empresa no encontrada" });
    return res.json({ ok: true, tema: row.tema || "lavanda" });
  } catch (e) {
    next(e);
  }
}

const TEMAS_VALIDOS = ["lavanda", "rosa", "menta", "celeste", "durazno", "arena"];

function setTemaEmpresa(req, res, next) {
  try {
    const db = require("../db/database");
    const empresaId = Number(req.params.id);
    const tema = String(req.body?.tema || "").trim().toLowerCase();
    if (!TEMAS_VALIDOS.includes(tema)) {
      return res.status(400).json({ ok: false, error: `Tema inválido. Válidos: ${TEMAS_VALIDOS.join(", ")}` });
    }
    const res2 = db.prepare("UPDATE empresas SET tema=? WHERE id=?").run(tema, empresaId);
    if (res2.changes === 0) return res.status(404).json({ ok: false, error: "Empresa no encontrada" });
    return res.json({ ok: true, empresaId, tema });
  } catch (e) {
    next(e);
  }
}

function getDatosFiscalesEmpresa(req, res, next) {
  try {
    const db = require("../db/database");
    const empresaId = Number(req.params.id);
    const empresa = db
      .prepare("SELECT id,nombre,cuit,condicion_iva,cert_path,key_path FROM empresas WHERE id=?")
      .get(empresaId);
    if (!empresa) return res.status(404).json({ ok: false, error: "Empresa no encontrada" });
    const row =
      db
        .prepare("SELECT e.*,c.* FROM empresas e LEFT JOIN empresa_configuraciones c ON c.empresa_id=e.id WHERE e.id=?")
        .get(empresaId) || {};
    let profile = {};
    try {
      profile = row.company_profile_json ? JSON.parse(row.company_profile_json) : {};
    } catch (e) {
      profile = {};
    }
    const data = {
      ...profile,
      razonSocial: row.razon_social || row.nombre || "",
      cuit: row.cuit || "",
      domicilio: row.direccion || "",
      telefono: row.telefono || "",
      email: row.email || "",
      condicionIVA: row.condicion_iva || "RESPONSABLE INSCRIPTO",
      logoUrl: row.logo_url || profile.logoUrl || "",
      usaSucursalAlIniciar: Boolean(row.require_branch_on_start),
      sucursalPredeterminadaId: row.default_branch_id || "",
      puntoVentaPredeterminadoId: row.default_pos_id || "",
      arcaAmbiente: row.arca_environment || "HOMOLOGACION",
    };
    const archivos = db
      .prepare("SELECT tipo,nombre_original,size_bytes,created_at FROM empresa_archivos_fiscales WHERE empresa_id=? AND activo=1")
      .all(empresaId);
    return res.json({
      ok: true,
      empresaId,
      data,
      archivos,
      conectado: { certificado: Boolean(empresa.cert_path), llave: Boolean(empresa.key_path) },
    });
  } catch (e) {
    next(e);
  }
}

function setDatosFiscalesEmpresa(req, res, next) {
  try {
    const db = require("../db/database");
    const empresaId = Number(req.params.id);
    const empresa = db.prepare("SELECT id FROM empresas WHERE id=?").get(empresaId);
    if (!empresa) return res.status(404).json({ ok: false, error: "Empresa no encontrada" });
    const d = req.body?.data || {};
    db.prepare("UPDATE empresas SET razon_social=?,cuit=?,direccion=?,telefono=?,email=?,condicion_iva=? WHERE id=?")
      .run(
        String(d.razonSocial || "").trim(),
        String(d.cuit || "").trim(),
        String(d.domicilio || "").trim(),
        String(d.telefono || "").trim(),
        String(d.email || "").trim(),
        String(d.condicionIVA || "RESPONSABLE INSCRIPTO").trim(),
        empresaId,
      );
    db.prepare(
      `INSERT INTO empresa_configuraciones(empresa_id,logo_url,require_branch_on_start,default_branch_id,default_pos_id,arca_environment,company_profile_json)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(empresa_id) DO UPDATE SET logo_url=excluded.logo_url,require_branch_on_start=excluded.require_branch_on_start,default_branch_id=excluded.default_branch_id,default_pos_id=excluded.default_pos_id,arca_environment=excluded.arca_environment,company_profile_json=excluded.company_profile_json,updated_at=CURRENT_TIMESTAMP`,
    ).run(
      empresaId,
      d.logoUrl || "",
      d.usaSucursalAlIniciar ? 1 : 0,
      d.sucursalPredeterminadaId || null,
      d.puntoVentaPredeterminadoId || null,
      d.arcaAmbiente || "HOMOLOGACION",
      JSON.stringify(d),
    );
    return res.json({ ok: true, empresaId, data: d });
  } catch (e) {
    next(e);
  }
}

function uploadArchivoFiscalEmpresa(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No se recibió el archivo." });
    const db = require("../db/database");
    const fs = require("fs");
    const empresaId = Number(req.params.id);
    const type = req.params.type === "key" ? "LLAVE_PRIVADA" : "CERTIFICADO";
    const previous = db
      .prepare("SELECT * FROM empresa_archivos_fiscales WHERE empresa_id=? AND tipo=?")
      .get(empresaId, type);
    if (previous?.ruta_segura && fs.existsSync(previous.ruta_segura)) fs.unlinkSync(previous.ruta_segura);
    db.prepare(
      `INSERT INTO empresa_archivos_fiscales(empresa_id,tipo,nombre_original,ruta_segura,mime_type,size_bytes) VALUES(?,?,?,?,?,?)
       ON CONFLICT(empresa_id,tipo) DO UPDATE SET nombre_original=excluded.nombre_original,ruta_segura=excluded.ruta_segura,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,activo=1,created_at=CURRENT_TIMESTAMP`,
    ).run(empresaId, type, req.file.originalname, req.file.path, req.file.mimetype, req.file.size);
    const column = req.params.type === "key" ? "key_path" : "cert_path";
    db.prepare(`UPDATE empresas SET ${column}=? WHERE id=?`).run(req.file.path, empresaId);
    return res.json({ ok: true, file: { type, name: req.file.originalname, size: req.file.size } });
  } catch (e) {
    next(e);
  }
}

function listarChangelog(req, res, next) {
  try {
    const db = require("../db/database");
    const rows = db.prepare("SELECT * FROM changelog ORDER BY fecha DESC, id DESC").all();
    return res.json({ ok: true, entradas: rows });
  } catch (e) {
    next(e);
  }
}

function incrementarVersion(v) {
  const parts = String(v || "4.0.0-beta.2.2").split(".");
  for (let i = parts.length - 1; i >= 0; i--) {
    const n = Number(parts[i]);
    if (!isNaN(n)) {
      parts[i] = String(n + 1);
      break;
    }
  }
  return parts.join(".");
}

function compararVersiones(a, b) {
  const pa = String(a || "").split(/[.\-]/).map((x) => Number(x) || 0);
  const pb = String(b || "").split(/[.\-]/).map((x) => Number(x) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function setVersionSistema(db, version) {
  db.prepare("INSERT INTO sistema_version(id,version,updated_at) VALUES(1,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET version=excluded.version,updated_at=CURRENT_TIMESTAMP").run(String(version));
}

function getVersionSistema(req, res, next) {
  try {
    const db = require("../db/database");
    const row = db.prepare("SELECT version FROM sistema_version WHERE id=1").get();
    return res.json({ ok: true, version: row?.version || "4.0.0-beta.2.2" });
  } catch (e) {
    next(e);
  }
}

function subirVersionSistema(req, res, next) {
  try {
    const db = require("../db/database");
    const row = db.prepare("SELECT version FROM sistema_version WHERE id=1").get();
    const actual = row?.version || "4.0.0-beta.2.2";
    const nueva = incrementarVersion(actual);
    setVersionSistema(db, nueva);
    return res.json({ ok: true, version: nueva, anterior: actual });
  } catch (e) {
    next(e);
  }
}

function importarClientesEmpresa(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No se recibió el archivo." });
    const db = require("../db/database");
    const fs = require("fs");
    const empresaId = Number(req.params.id);
    const empresa = db.prepare("SELECT id FROM empresas WHERE id=?").get(empresaId);
    if (!empresa) return res.status(404).json({ ok: false, error: "Empresa no encontrada." });
    const { parseCsv, headerIndex, valorFila } = require("../utils/csv");
    const filas = parseCsv(fs.readFileSync(req.file.path, "utf8"));
    if (filas.length < 2) return res.status(400).json({ ok: false, error: "El CSV debe tener una fila de encabezados y al menos un cliente." });
    const headers = filas[0];
    const iNombre = headerIndex(headers, "nombre", "razonsocial", "razon", "cliente");
    const iCuit = headerIndex(headers, "cuit");
    const iDni = headerIndex(headers, "dni", "documento");
    const iCond = headerIndex(headers, "condicioniva", "condicion");
    const iDomicilio = headerIndex(headers, "domicilio", "direccion");
    const iLocalidad = headerIndex(headers, "localidad");
    const iProvincia = headerIndex(headers, "provincia");
    const iEmail = headerIndex(headers, "email", "correo");
    const iTelefono = headerIndex(headers, "telefono", "tel");
    const iDescuento = headerIndex(headers, "descuento");
    if (iNombre < 0) return res.status(400).json({ ok: false, error: "El CSV de clientes debe tener una columna \"nombre\" (o razon social)." });
    const insert = db.prepare(
      "INSERT INTO clientes(empresa_id,razon_social,cuit,dni,condicion_iva,domicilio,localidad,provincia,email,telefono,descuento_porcentaje) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    );
    const errores = [];
    let importados = 0;
    for (const fila of filas.slice(1)) {
      const nombre = valorFila(fila, headers, iNombre);
      if (!nombre) { errores.push("Fila sin nombre"); continue; }
      const cuit = valorFila(fila, headers, iCuit);
      const dni = valorFila(fila, headers, iDni);
      const dup = cuit || dni
        ? db.prepare("SELECT id,razon_social FROM clientes WHERE empresa_id=? AND (cuit=? OR dni=?) AND cuit<>''").get(empresaId, cuit, dni)
        : null;
      if (dup) { errores.push(`Ya existe un cliente cargado con ese documento: ${dup.razon_social} (${cuit || dni})`); continue; }
      insert.run(
        empresaId, nombre, cuit || null, dni || null,
        valorFila(fila, headers, iCond) || "CONSUMIDOR FINAL",
        valorFila(fila, headers, iDomicilio) || null,
        valorFila(fila, headers, iLocalidad) || null,
        valorFila(fila, headers, iProvincia) || null,
        valorFila(fila, headers, iEmail) || null,
        valorFila(fila, headers, iTelefono) || null,
        Math.max(0, Math.min(100, Number(valorFila(fila, headers, iDescuento)) || 0)),
      );
      importados++;
    }
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.json({ ok: true, importados, errores: errores.slice(0, 20), total: filas.length - 1 });
  } catch (e) {
    next(e);
  }
}

function importarProductosEmpresa(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No se recibió el archivo." });
    const db = require("../db/database");
    const fs = require("fs");
    const empresaId = Number(req.params.id);
    const empresa = db.prepare("SELECT id FROM empresas WHERE id=?").get(empresaId);
    if (!empresa) return res.status(404).json({ ok: false, error: "Empresa no encontrada." });
    const { parseCsv, headerIndex, valorFila } = require("../utils/csv");
    const filas = parseCsv(fs.readFileSync(req.file.path, "utf8"));
    if (filas.length < 2) return res.status(400).json({ ok: false, error: "El CSV debe tener una fila de encabezados y al menos un producto." });
    const headers = filas[0];
    const iCodigo = headerIndex(headers, "codigo", "cod");
    const iDesc = headerIndex(headers, "descripcion", "nombre", "producto");
    const iPrecio = headerIndex(headers, "precio", "precioventa");
    const iIva = headerIndex(headers, "iva");
    const iCosto = headerIndex(headers, "costo");
    const iUnidad = headerIndex(headers, "unidad");
    const iBarra = headerIndex(headers, "codigobarra", "barras", "ean");
    const iRubro = headerIndex(headers, "rubro");
    if (iCodigo < 0 || iDesc < 0) return res.status(400).json({ ok: false, error: "El CSV de productos debe tener columnas \"codigo\" y \"descripcion\"." });
    const insert = db.prepare(
      "INSERT INTO productos(empresa_id,codigo,codigo_barra,descripcion,precio,iva,costo,unidad,rubro_id,activo,utilidad) VALUES(?,?,?,?,?,?,?,?,?,1,0)",
    );
    const errores = [];
    let importados = 0;
    for (const fila of filas.slice(1)) {
      const codigo = valorFila(fila, headers, iCodigo);
      const descripcion = valorFila(fila, headers, iDesc);
      if (!codigo || !descripcion) { errores.push("Fila sin código o descripción"); continue; }
      const dup = db.prepare("SELECT id FROM productos WHERE empresa_id=? AND codigo=?").get(empresaId, codigo);
      if (dup) { errores.push(`Producto duplicado (código): ${codigo}`); continue; }
      let rubroId = null;
      const rubroNombre = valorFila(fila, headers, iRubro);
      if (rubroNombre) {
        const existente = db.prepare("SELECT id FROM rubros_productos WHERE empresa_id=? AND nombre=? COLLATE NOCASE").get(empresaId, rubroNombre);
        rubroId = existente?.id || db.prepare("INSERT INTO rubros_productos(empresa_id,nombre,activo) VALUES(?,?,1)").run(empresaId, rubroNombre).lastInsertRowid;
      }
      const precio = Number(valorFila(fila, headers, iPrecio).replace(",", ".")) || 0;
      const iva = Number(valorFila(fila, headers, iIva).replace(",", ".")) || 0;
      const costo = Number(valorFila(fila, headers, iCosto).replace(",", ".")) || 0;
      insert.run(
        empresaId, codigo, valorFila(fila, headers, iBarra) || null, descripcion,
        Math.round(precio * 100) / 100, iva, Math.round(costo * 100) / 100,
        valorFila(fila, headers, iUnidad) || "UN", rubroId,
      );
      importados++;
    }
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.json({ ok: true, importados, errores: errores.slice(0, 20), total: filas.length - 1 });
  } catch (e) {
    next(e);
  }
}

function crearChangelog(req, res, next) {
  try {
    const db = require("../db/database");
    const { version, fecha, tipo, titulo, detalle } = req.body || {};
    if (!String(version || "").trim() || !String(titulo || "").trim()) {
      return res.status(400).json({ ok: false, error: "Versión y título son obligatorios." });
    }
    const info = db
      .prepare("INSERT INTO changelog(version,fecha,tipo,titulo,detalle) VALUES(?,?,?,?,?)")
      .run(
        String(version).trim(),
        String(fecha || new Date().toISOString().slice(0, 10)),
        ["NUEVO", "CORRECCION", "MEJORA"].includes(String(tipo || "").toUpperCase()) ? String(tipo).toUpperCase() : "MEJORA",
        String(titulo).trim(),
        String(detalle || "").trim() || null,
      );
    const versionNueva = String(version).trim();
    const rowActual = db.prepare("SELECT version FROM sistema_version WHERE id=1").get();
    if (!rowActual || compararVersiones(versionNueva, rowActual.version) > 0) setVersionSistema(db, versionNueva);
    const row = db.prepare("SELECT * FROM changelog WHERE id=?").get(info.lastInsertRowid);
    return res.status(201).json({ ok: true, entrada: row });
  } catch (e) {
    next(e);
  }
}

function actualizarChangelog(req, res, next) {
  try {
    const db = require("../db/database");
    const id = Number(req.params.id);
    const existente = db.prepare("SELECT * FROM changelog WHERE id=?").get(id);
    if (!existente) return res.status(404).json({ ok: false, error: "Entrada no encontrada." });
    const b = req.body || {};
    db.prepare("UPDATE changelog SET version=?,fecha=?,tipo=?,titulo=?,detalle=? WHERE id=?")
      .run(
        String(b.version || existente.version).trim(),
        String(b.fecha || existente.fecha),
        ["NUEVO", "CORRECCION", "MEJORA"].includes(String(b.tipo || existente.tipo).toUpperCase()) ? String(b.tipo || existente.tipo).toUpperCase() : existente.tipo,
        String(b.titulo || existente.titulo).trim(),
        b.detalle !== undefined ? String(b.detalle || "").trim() || null : existente.detalle,
        id,
      );
    const versionEditada = String(b.version || existente.version).trim();
    const rowEdit = db.prepare("SELECT version FROM sistema_version WHERE id=1").get();
    if (!rowEdit || compararVersiones(versionEditada, rowEdit.version) > 0) setVersionSistema(db, versionEditada);
    return res.json({ ok: true, entrada: db.prepare("SELECT * FROM changelog WHERE id=?").get(id) });
  } catch (e) {
    next(e);
  }
}

function eliminarChangelog(req, res, next) {
  try {
    const db = require("../db/database");
    const info = db.prepare("DELETE FROM changelog WHERE id=?").run(Number(req.params.id));
    if (!info.changes) return res.status(404).json({ ok: false, error: "Entrada no encontrada." });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

async function recuperarSuperadmin(req, res, next) {
  try {
    const identificador =
      req.body?.identificador || req.body?.usuario || req.body?.email;
    const result = await passwordRecovery.solicitarSuperadmin(identificador);
    res.json({
      ok: true,
      mensaje:
        "Si la cuenta tiene un correo de recuperación, te enviamos un enlace para restablecer la contraseña.",
      ...(result.link && process.env.NODE_ENV !== "production"
        ? { link: result.link }
        : {}),
    });
  } catch (e) {
    next(e);
  }
}

function restablecerSuperadmin(req, res, next) {
  try {
    const result = passwordRecovery.restablecer({
      token: req.body?.token,
      password: req.body?.password,
    });
    res.json({ ok: true, ...result, mensaje: "Contraseña actualizada." });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  loginSuperAdmin,
  recuperarSuperadmin,
  restablecerSuperadmin,
  listarEmpresas,
  crearEmpresa,
  actualizarEmpresa,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  listarLicencias,
  crearLicencia,
  cambiarEstadoLicencia,
  listarModulosEmpresa,
  setModuloEmpresa,
  getTemaEmpresa,
  setTemaEmpresa,
  getDatosFiscalesEmpresa,
  setDatosFiscalesEmpresa,
  uploadArchivoFiscalEmpresa,
  listarChangelog,
  crearChangelog,
  actualizarChangelog,
  eliminarChangelog,
  getVersionSistema,
  subirVersionSistema,
  importarClientesEmpresa,
  importarProductosEmpresa,
};