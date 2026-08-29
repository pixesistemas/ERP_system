require("dotenv").config();

const db = require("../../src/db/database");

const permisos = [
  ["facturas.emitir", "Emitir facturas"],
  ["facturas.consultar", "Consultar facturas"],
  ["documentos.crear", "Crear documentos"],
  ["documentos.consultar", "Consultar documentos"],
  ["documentos.convertir", "Convertir documentos"],
  ["productos.gestionar", "Gestionar productos"],
  ["clientes.gestionar", "Gestionar clientes"],
  ["usuarios.gestionar", "Gestionar usuarios"],
  ["stock.gestionar", "Gestionar stock"],
  ["stock.consultar", "Consultar stock"],
  ["clientes.cc.consultar", "Consultar cuenta corriente de clientes"],
  ["clientes.cc.cobrar", "Registrar cobros de clientes"],
  ["recibos.crear", "Crear recibos"],
  ["recibos.consultar", "Consultar recibos"],
  ["recibos.confirmar", "Confirmar recibos"],
  ["comisiones.consultar", "Consultar comisiones"],
  ["comisiones.liquidar", "Liquidar comisiones"],
  ["stock.reservar", "Reservar stock"],
  ["procesos.consultar", "Consultar procesos disponibles"],
  ["procesos.ejecutar", "Ejecutar procesos de negocio"],
  ["workspaces.consultar", "Consultar operaciones en curso"],
  ["workspaces.gestionar", "Gestionar operaciones en curso"],
  ["workspaces.confirmar", "Confirmar operaciones en curso"],
  ["sessions.consultar", "Consultar sesiones comerciales"],
  ["sessions.gestionar", "Gestionar sesiones comerciales"],
  ["conversations.consultar", "Consultar conversaciones comerciales"],
  ["conversations.gestionar", "Gestionar conversaciones comerciales"],
];

for (const [codigo, descripcion] of permisos) {
  db.prepare(
    `
    INSERT OR IGNORE INTO permisos (codigo, descripcion)
    VALUES (?, ?)
  `,
  ).run(codigo, descripcion);
}

const roles = [
  ["ADMIN", "Administrador general"],
  ["VENDEDOR", "Vendedor comercial"],
  ["CONTADOR", "Consulta fiscal y contable"],
  ["OPERADOR_WHATSAPP", "Operador autorizado desde WhatsApp"],
];

for (const [nombre, descripcion] of roles) {
  db.prepare(
    `
    INSERT OR IGNORE INTO roles (nombre, descripcion)
    VALUES (?, ?)
  `,
  ).run(nombre, descripcion);
}

const permisosPorRol = {
  ADMIN: permisos.map((p) => p[0]),

  VENDEDOR: [
    "facturas.emitir",
    "facturas.consultar",
    "documentos.crear",
    "documentos.consultar",
    "documentos.convertir",
    "stock.consultar",
    "clientes.cc.consultar",
    "comisiones.consultar",
    "stock.reservar",
    "procesos.consultar",
    "procesos.ejecutar",
    "workspaces.consultar",
    "workspaces.gestionar",
    "workspaces.confirmar",
    "conversations.consultar",
    "conversations.gestionar",
  ],

  CONTADOR: ["facturas.consultar", "documentos.consultar"],

  OPERADOR_WHATSAPP: [
    "facturas.emitir",
    "facturas.consultar",
    "documentos.crear",
    "documentos.consultar",
  ],
};

for (const rolNombre in permisosPorRol) {
  const rol = db
    .prepare(
      `
    SELECT * FROM roles WHERE nombre = ?
  `,
    )
    .get(rolNombre);

  for (const permisoCodigo of permisosPorRol[rolNombre]) {
    const permiso = db
      .prepare(
        `
      SELECT * FROM permisos WHERE codigo = ?
    `,
      )
      .get(permisoCodigo);

    db.prepare(
      `
      INSERT OR IGNORE INTO rol_permisos (rol_id, permiso_id)
      VALUES (?, ?)
    `,
    ).run(rol.id, permiso.id);
  }
}

console.log("Roles y permisos actualizados");
