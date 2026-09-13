require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../src/db/database");

/*
 * Resetea (o crea) el usuario superadmin en producción.
 *
 * Uso:
 *   node scripts/reset-superadmin.js [clave] [email]
 *
 * Si no se pasa clave, usa SUPERADMIN_PASSWORD del entorno.
 * Si no se pasa email, usa SUPERADMIN_EMAIL del entorno.
 *
 * Ejemplo en el contenedor:
 *   node scripts/reset-superadmin.js Jorgeda87
 */

const clave = process.argv[2] || process.env.SUPERADMIN_PASSWORD;
const email = process.argv[3] || process.env.SUPERADMIN_EMAIL || null;

if (!clave) {
  console.error("Falta la clave. Pasala como argumento o definí SUPERADMIN_PASSWORD.");
  process.exit(1);
}

const sa = db.prepare("SELECT * FROM super_admins WHERE usuario='superadmin'").get();

if (!sa) {
  db.prepare(
    "INSERT INTO super_admins(usuario,nombre,email,password_hash,activo) VALUES ('superadmin','Administrador PixeSistemas',?,?,1)",
  ).run(email, bcrypt.hashSync(clave, 10));
  console.log("Superadmin creado. Usuario: superadmin");
} else {
  db.prepare("UPDATE super_admins SET password_hash=?, activo=1, email=COALESCE(?, email) WHERE id=?").run(
    bcrypt.hashSync(clave, 10),
    email,
    sa.id,
  );
  console.log("Superadmin actualizado. Usuario: superadmin");
}

const row = db.prepare("SELECT id,usuario,email,activo FROM super_admins WHERE usuario='superadmin'").get();
console.log(row);
console.log(`Clave seteada correctamente. Entrá en #/superadmin con usuario 'superadmin'.`);
