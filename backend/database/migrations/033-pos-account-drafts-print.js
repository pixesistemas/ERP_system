const db=require('../../src/db/database');
const pointCols=db.prepare('PRAGMA table_info(puntos_venta)').all().map(x=>x.name);
if(!pointCols.includes('formato_impresion')) db.exec("ALTER TABLE puntos_venta ADD COLUMN formato_impresion TEXT NOT NULL DEFAULT 'A4'");
db.exec(`
CREATE TABLE IF NOT EXISTS pos_borradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  datos_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id,usuario_id),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id),
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
);
`);
console.log('033 POS cuenta corriente, borradores e impresión aplicada');
