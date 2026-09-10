const db = require("../../src/db/database");
const { PANTALLAS } = require("../../src/constants/pantallas");

/*
 * Soporte para sumar automáticamente las pantallas nuevas a los roles que
 * ya tienen una lista explícita de pantallas.
 *
 * - pantallas_registro: guarda cada pantalla con la fecha en que se dio de
 *   alta (al instalar esta mejora, las existentes se registran "ahora").
 * - roles.pantallas_actualizado_en: fecha de la última vez que se guardó la
 *   lista de pantallas del rol. Todo lo registrado DESPUÉS de esa fecha se
 *   considera "nuevo" y se suma solo (ver reconciliarPantallas).
 *
 * Esta migración deja la referencia de los roles en "2000-01-01", para que
 * la primera reconciliación nivele todos los roles con las pantallas
 * actuales que les falten. A partir de ahí, cada vez que el rol se guarde
 * la referencia se actualiza y solo se sumarán las pantallas realmente nuevas.
 */

const tablaExiste = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pantallas_registro'",
  )
  .get();

if (!tablaExiste) {
  db.exec(`
    CREATE TABLE pantallas_registro (
      pantalla TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Tabla pantallas_registro creada.");
} else {
  console.log("Tabla pantallas_registro ya existía.");
}

const columnasRoles = db
  .prepare("PRAGMA table_info(roles)")
  .all()
  .map((c) => c.name);

if (!columnasRoles.includes("pantallas_actualizado_en")) {
  db.exec("ALTER TABLE roles ADD COLUMN pantallas_actualizado_en TEXT");
  console.log("roles.pantallas_actualizado_en agregada.");
} else {
  console.log("roles.pantallas_actualizado_en ya existía.");
}

// Registra las pantallas actuales con la fecha de hoy: la primera
// reconciliación las sumará a los roles que les falten (nivelación inicial).
const registrar = db.prepare(
  "INSERT OR IGNORE INTO pantallas_registro(pantalla, created_at) VALUES(?, CURRENT_TIMESTAMP)",
);
for (const pantalla of PANTALLAS) registrar.run(pantalla);

// Deja la referencia de los roles en "2000-01-01" para forzar esa primera
// nivelación. Cuando el administrador guarde un rol, la referencia pasa a
// "ahora" y solo se sumarán las pantallas realmente nuevas.
db.prepare(
  "UPDATE roles SET pantallas_actualizado_en = '2000-01-01 00:00:00' WHERE pantallas_actualizado_en IS NULL",
).run();

console.log(
  `Pantallas registradas: ${PANTALLAS.length}. Referencia de roles preparada para nivelación inicial.`,
);