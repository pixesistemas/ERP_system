const db = require("../../src/db/database");

/*
 * Reportes de errores y sugerencias enviados por los usuarios del ERP
 * desde el botón "Reportar problema". El superadmin los ve y responde.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS reportes_usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER,
    empresa_nombre TEXT,
    usuario_id INTEGER,
    usuario_nombre TEXT,
    tipo TEXT NOT NULL DEFAULT 'SUGERENCIA',
    mensaje TEXT NOT NULL,
    pagina TEXT,
    estado TEXT NOT NULL DEFAULT 'NUEVO',
    respuesta TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log("086: tabla reportes_usuarios creada");
