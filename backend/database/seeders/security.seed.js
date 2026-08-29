require("dotenv").config();

const db = require("../../src/db/database");
const {
  getEmpresaByNombre,
} = require("../../src/repositories/empresa.repository");

const empresa = getEmpresaByNombre("empresa1");

const permisos = [
  ["facturas.emitir", "Emitir facturas"],
  ["facturas.consultar", "Consultar facturas"],
  ["documentos.crear", "Crear documentos comerciales"],
  ["documentos.consultar", "Consultar documentos comerciales"],
  ["documentos.convertir", "Convertir documentos"],
  ["productos.gestionar", "Gestionar productos"],
  ["clientes.gestionar", "Gestionar clientes"],
  ["usuarios.gestionar", "Gestionar usuarios"],
];

for (const [codigo, descripcion] of permisos) {
  db.prepare(
    `
    INSERT OR IGNORE INTO permisos (codigo, descripcion)
    VALUES (?, ?)
  `,
  ).run(codigo, descripcion);
}

db.prepare(
  `
  INSERT OR IGNORE INTO roles (nombre, descripcion)
  VALUES ('ADMIN', 'Administrador general')
`,
).run();

const adminUser = db
  .prepare(
    `
  INSERT OR IGNORE INTO usuarios (nombre, email, telefono, activo)
  VALUES ('Administrador', 'admin@empresa.com', '5493450000000', 1)
`,
  )
  .run();

const usuario = db
  .prepare(
    `
  SELECT * FROM usuarios WHERE email = 'admin@empresa.com'
`,
  )
  .get();

const rolAdmin = db
  .prepare(
    `
  SELECT * FROM roles WHERE nombre = 'ADMIN'
`,
  )
  .get();

db.prepare(
  `
  INSERT OR IGNORE INTO usuario_empresas (usuario_id, empresa_id, activo)
  VALUES (?, ?, 1)
`,
).run(usuario.id, empresa.id);

db.prepare(
  `
  INSERT OR IGNORE INTO usuario_roles (usuario_id, empresa_id, rol_id)
  VALUES (?, ?, ?)
`,
).run(usuario.id, empresa.id, rolAdmin.id);

const allPermisos = db.prepare(`SELECT * FROM permisos`).all();

for (const permiso of allPermisos) {
  db.prepare(
    `
    INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
    VALUES (?, ?)
  `,
  ).run(rolAdmin.id, permiso.id);
}

console.log("Seed de seguridad creado");
