const db = require('../../src/db/database');

/* Tema visual por empresa (paletas pastel seleccionadas por el superadmin). */
const cols = db.prepare("PRAGMA table_info(empresas)").all();
if (!cols.some((c) => c.name === 'tema')) {
  db.exec("ALTER TABLE empresas ADD COLUMN tema TEXT DEFAULT 'lavanda'");
  console.log('Columna agregada: empresas.tema');
} else {
  console.log('Columna existente: empresas.tema');
}