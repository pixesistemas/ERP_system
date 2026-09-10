const db = require("../db/database");

/*
 * Relación pantalla de menú → códigos de permiso que necesita el backend
 * para servir los endpoints de esa pantalla. Cuando se guardan pantallas
 * de un rol, se sincronizan estos códigos en rol_permisos.
 */
const PANTALLA_PERMISOS = {
  pos: ["facturas.emitir", "documentos.crear", "productos.gestionar", "clientes.gestionar"],
  sales: ["facturas.consultar", "documentos.consultar"],
  documents: ["documentos.crear", "documentos.consultar", "documentos.convertir", "facturas.emitir", "facturas.consultar"],
  budgets: ["documentos.crear", "documentos.consultar"],
  "sales-notes": ["documentos.crear", "documentos.consultar"],
  reservations: ["documentos.crear", "documentos.consultar", "stock.reservar"],
  orders: ["documentos.crear", "documentos.consultar"],
  remitos: ["documentos.crear", "documentos.consultar", "stock.gestionar"],
  products: ["productos.gestionar"],
  categories: ["productos.gestionar"],
  units: ["productos.gestionar"],
  "price-update": ["productos.gestionar"],
  imports: ["productos.gestionar"],
  "shelf-labels": ["productos.gestionar"],
  stock: ["stock.gestionar", "stock.consultar"],
  "stock-moves": ["stock.consultar"],
  "stock-transfers": ["stock.gestionar"],
  "branch-stock": ["stock.consultar"],
  combos: ["productos.gestionar"],
  "quantity-discounts": ["productos.gestionar"],
  promotions: ["productos.gestionar"],
  raffles: ["productos.gestionar"],
  clients: ["clientes.gestionar"],
  sellers: ["comisiones.consultar"],
  accounts: ["clientes.cc.consultar", "clientes.cc.cobrar", "recibos.consultar"],
  receipts: ["recibos.crear", "recibos.consultar", "recibos.confirmar"],
  reports: ["comisiones.consultar", "facturas.consultar", "documentos.consultar"],
  "sales-reports": ["facturas.consultar", "documentos.consultar"],
  "dynamic-orders-report": ["documentos.consultar"],
  users: ["usuarios.gestionar"],
  roles: ["usuarios.gestionar"],
};

function sincronizarPermisosRol(rolId) {
  const pantallas = getPantallasRol(rolId);
  const codigos = [
    ...new Set(pantallas.flatMap((p) => PANTALLA_PERMISOS[p] || [])),
  ];
  db.prepare(`DELETE FROM rol_permisos WHERE rol_id = ?`).run(rolId);
  if (!codigos.length) return;
  const insert = db.prepare(
    `INSERT INTO rol_permisos (rol_id, permiso_id)
     SELECT ?, id FROM permisos WHERE codigo = ?`,
  );
  for (const codigo of codigos) insert.run(rolId, codigo);
}

function listRoles() {
  return db
    .prepare(
      `
      SELECT id, nombre, descripcion
      FROM roles
      ORDER BY nombre
    `,
    )
    .all();
}

function crearRol({ nombre, descripcion }) {
  if (!nombre || !nombre.trim()) {
    const error = new Error("Debe informar un nombre de rol");
    error.statusCode = 400;
    throw error;
  }

  const codigo = nombre.trim().toUpperCase();

  try {
    const result = db
      .prepare(
        `
        INSERT INTO roles (nombre, descripcion)
        VALUES (?, ?)
      `,
      )
      .run(codigo, descripcion || null);

    return { id: result.lastInsertRowid, nombre: codigo, descripcion: descripcion || null };
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      const err = new Error(`Ya existe un rol llamado ${codigo}`);
      err.statusCode = 409;
      throw err;
    }
    throw error;
  }
}

function eliminarRol(rolId) {
  const enUso = db
    .prepare(`SELECT COUNT(*) AS n FROM usuario_roles WHERE rol_id = ?`)
    .get(rolId);

  if (enUso.n > 0) {
    const error = new Error(
      "No se puede eliminar un rol que tiene usuarios asignados",
    );
    error.statusCode = 400;
    throw error;
  }

  db.prepare(`DELETE FROM rol_pantallas WHERE rol_id = ?`).run(rolId);
  db.prepare(`DELETE FROM rol_permisos WHERE rol_id = ?`).run(rolId);
  db.prepare(`DELETE FROM roles WHERE id = ?`).run(rolId);
}

function getPantallasRol(rolId) {
  const rows = db
    .prepare(`SELECT pantalla FROM rol_pantallas WHERE rol_id = ?`)
    .all(rolId);

  return rows.map((row) => row.pantalla);
}

/*
 * Si el rol no tiene ninguna fila en rol_pantallas, devuelve null
 * (= puede ver todas las pantallas). Si tiene al menos una, devuelve
 * exactamente esa lista.
 */
function getPantallasUsuario({ usuarioId, empresaId }) {
  const roles = db
    .prepare(
      `
      SELECT r.id
      FROM usuario_roles ur
      INNER JOIN roles r ON r.id = ur.rol_id
      WHERE ur.usuario_id = ?
        AND ur.empresa_id = ?
    `,
    )
    .all(usuarioId, empresaId);

  if (!roles.length) return null;

  const pantallas = [
    ...new Set(roles.flatMap((rol) => getPantallasRol(rol.id))),
  ];

  return pantallas.length ? pantallas : null;
}

function setPantallasRol({ rolId, pantallas }) {
  const rol = db.prepare(`SELECT id FROM roles WHERE id = ?`).get(rolId);

  if (!rol) {
    const error = new Error("Rol no encontrado");
    error.statusCode = 404;
    throw error;
  }

  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM rol_pantallas WHERE rol_id = ?`).run(rolId);

    const insert = db.prepare(
      `INSERT INTO rol_pantallas (rol_id, pantalla) VALUES (?, ?)`,
    );

    for (const pantalla of pantallas) {
      insert.run(rolId, String(pantalla));
    }

    // Marca la referencia: las pantallas registradas después de este momento
    // se considerarán "nuevas" y se sumarán solas a este rol (ver pantallas.js).
    db.prepare(
      `UPDATE roles SET pantallas_actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(rolId);

    sincronizarPermisosRol(rolId);
  });

  transaction();

  return getPantallasRol(rolId);
}

module.exports = {
  listRoles,
  crearRol,
  eliminarRol,
  getPantallasRol,
  getPantallasUsuario,
  setPantallasRol,
  sincronizarPermisosRol,
  PANTALLA_PERMISOS,
};
