const db = require("../../src/db/database");

/*
 * Recuperación de contraseña por correo (usuarios comunes y superadmin).
 * - recuperaciones_clave: guarda el hash del token, su vencimiento y si ya
 *   se usó. El token en claro solo viaja por mail, nunca se guarda.
 * - super_admins.email: correo de recuperación del superadmin (opcional).
 */

const tabla = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='recuperaciones_clave'",
  )
  .get();

if (!tabla) {
  db.exec(`
    CREATE TABLE recuperaciones_clave (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      ref_id INTEGER NOT NULL,
      email TEXT,
      token_hash TEXT NOT NULL,
      expira_en TEXT NOT NULL,
      usado INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_recuperaciones_token ON recuperaciones_clave(token_hash)",
  );
  console.log("Tabla recuperaciones_clave creada.");
} else {
  console.log("Tabla recuperaciones_clave ya existía.");
}

const cols = db
  .prepare("PRAGMA table_info(super_admins)")
  .all()
  .map((c) => c.name);

if (!cols.includes("email")) {
  db.exec("ALTER TABLE super_admins ADD COLUMN email TEXT");
  console.log("super_admins.email agregada.");
} else {
  console.log("super_admins.email ya existía.");
}