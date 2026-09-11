const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./database");

/*
 * Datos esenciales que SIEMPRE deben existir (permisos, rol ADMIN y la
 * cuenta de superadmin), separados de los datos de demostración.
 *
 * En producción (DEMO_MODE=false) no se crea la empresa demo ni el usuario
 * admin@empresa.com. El superadmin toma su clave de SUPERADMIN_PASSWORD.
 */

const PERMS = [
  "facturas.emitir", "facturas.consultar", "documentos.crear", "documentos.consultar",
  "documentos.convertir", "productos.gestionar", "clientes.gestionar", "usuarios.gestionar",
  "stock.gestionar", "stock.consultar", "clientes.cc.consultar", "clientes.cc.cobrar",
  "recibos.crear", "recibos.consultar", "recibos.confirmar", "comisiones.consultar",
  "comisiones.liquidar", "stock.reservar", "procesos.consultar", "procesos.ejecutar",
  "workspaces.consultar", "workspaces.gestionar", "workspaces.confirmar",
  "sessions.consultar", "sessions.gestionar", "conversations.consultar", "conversations.gestionar",
];

function seedEsencial() {
  for (const p of PERMS) {
    db.prepare("INSERT OR IGNORE INTO permisos(codigo,descripcion) VALUES (?,?)").run(p, p);
  }
  db.prepare("INSERT OR IGNORE INTO roles(nombre,descripcion) VALUES ('ADMIN','Administrador general')").run();
  const role = db.prepare("SELECT id FROM roles WHERE nombre='ADMIN'").get();
  for (const row of db.prepare("SELECT id FROM permisos").all()) {
    db.prepare("INSERT OR IGNORE INTO rol_permisos(rol_id,permiso_id) VALUES (?,?)").run(role.id, row.id);
  }
}

function asegurarSuperadmin(demo) {
  const pass = process.env.SUPERADMIN_PASSWORD;
  const email = process.env.SUPERADMIN_EMAIL || null;
  const sa = db.prepare("SELECT * FROM super_admins WHERE usuario='superadmin'").get();

  if (!sa) {
    const p = pass || (demo ? "admin123" : crypto.randomBytes(9).toString("base64url"));
    if (!pass && !demo) {
      console.log(`[SEED] Superadmin creado con clave aleatoria: ${p} (guardala ahora).`);
    }
    db.prepare(
      "INSERT INTO super_admins(usuario,nombre,email,password_hash,activo) VALUES ('superadmin','Administrador PixeSistemas',?,?,1)",
    ).run(email, bcrypt.hashSync(p, 10));
    return { creado: true, claveGenerada: !pass && !demo ? p : null };
  }

  if (email && sa.email !== email) {
    db.prepare("UPDATE super_admins SET email=? WHERE id=?").run(email, sa.id);
  }

  // Si hay SUPERADMIN_PASSWORD, es la fuente de verdad: se aplica siempre.
  if (pass) {
    db.prepare("UPDATE super_admins SET password_hash=? WHERE id=?").run(bcrypt.hashSync(pass, 10), sa.id);
    return { actualizado: true };
  }

  // En producción, si quedó la clave insegura por defecto, se reemplaza.
  if (!demo && bcrypt.compareSync("admin123", sa.password_hash || "")) {
    const nueva = crypto.randomBytes(9).toString("base64url");
    db.prepare("UPDATE super_admins SET password_hash=? WHERE id=?").run(bcrypt.hashSync(nueva, 10), sa.id);
    console.log(`[SEED] Clave de superadmin insegura reemplazada. Nueva clave: ${nueva} (guardala ahora).`);
    return { claveGenerada: nueva };
  }

  return {};
}

module.exports = { seedEsencial, asegurarSuperadmin, PERMS };