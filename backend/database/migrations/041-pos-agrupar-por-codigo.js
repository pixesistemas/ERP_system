const db = require('../../src/db/database');

const columns = db.prepare('PRAGMA table_info(empresa_configuraciones)').all().map(x => x.name);
if (!columns.includes('pos_agrupar_por_codigo')) {
  db.exec(`ALTER TABLE empresa_configuraciones ADD COLUMN pos_agrupar_por_codigo INTEGER NOT NULL DEFAULT 1`);
  db.exec(`UPDATE empresa_configuraciones SET pos_agrupar_por_codigo = 1`);
}

console.log('041 config POS agrupar por codigo aplicada');