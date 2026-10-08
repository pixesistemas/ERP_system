const db = require("../../src/db/database");

/*
 * Licencias anuales: la tabla original tenía un CHECK que solo permitía
 * MENSUAL, TRIMESTRAL y DEFINITIVO. SQLite no permite modificar un CHECK,
 * así que se recrea la tabla conservando los datos y agregando ANUAL.
 */

const tabla = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='licencias'")
  .get();

if (tabla && !String(tabla.sql).includes("'ANUAL'")) {
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE licencias_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        plan TEXT NOT NULL CHECK (plan IN ('MENSUAL','TRIMESTRAL','ANUAL','DEFINITIVO')),
        precio REAL NOT NULL DEFAULT 0,
        descuento_porc REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        fecha_inicio TEXT NOT NULL,
        fecha_vencimiento TEXT,
        estado TEXT NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','VENCIDA','CANCELADA')),
        notas TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (empresa_id) REFERENCES empresas(id)
      );
      INSERT INTO licencias_nueva
        (id, empresa_id, plan, precio, descuento_porc, total, fecha_inicio, fecha_vencimiento, estado, notas, created_at)
      SELECT id, empresa_id, plan, precio, descuento_porc, total, fecha_inicio, fecha_vencimiento, estado, notas, created_at
      FROM licencias;
      DROP TABLE licencias;
      ALTER TABLE licencias_nueva RENAME TO licencias;
      CREATE INDEX IF NOT EXISTS idx_licencias_empresa ON licencias (empresa_id);
    `);
  });
  tx();
  console.log("092: licencias ahora admiten plan ANUAL");
} else {
  console.log("092: licencias ya admiten plan ANUAL");
}
