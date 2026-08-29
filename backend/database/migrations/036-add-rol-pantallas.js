const db = require("../../src/db/database");

/*
 * Migración 036
 *
 * Agrega la tabla rol_pantallas: qué pantallas del menú puede ver cada rol.
 * Si un rol no tiene ninguna fila acá, se interpreta como "puede ver todas"
 * (así el rol ADMIN sembrado por seedDemo.js sigue funcionando igual que
 * antes, sin tener que migrar datos existentes).
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS rol_pantallas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rol_id INTEGER NOT NULL,
    pantalla TEXT NOT NULL,
    FOREIGN KEY (rol_id) REFERENCES roles(id),
    UNIQUE (rol_id, pantalla)
  );
`);

console.log("Tabla rol_pantallas creada");
