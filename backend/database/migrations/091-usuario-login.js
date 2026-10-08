const db = require("../../src/db/database");

/*
 * Login por nombre de usuario.
 *
 * Agrega la columna usuarios.usuario para poder iniciar sesión con un nombre
 * corto (sin email) además del correo. El email queda opcional.
 */

const columnas = db
  .prepare("PRAGMA table_info(usuarios)")
  .all()
  .map((c) => c.name);

if (!columnas.includes("usuario")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN usuario TEXT");
  console.log("091: usuarios.usuario agregada");
}

db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario) WHERE usuario IS NOT NULL",
);

console.log("091: login por nombre de usuario listo");
