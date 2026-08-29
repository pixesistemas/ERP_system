const db=require('../../src/db/database');
db.exec(`
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  clave TEXT NOT NULL,
  valor_json TEXT NOT NULL DEFAULT 'null',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id,clave),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE INDEX IF NOT EXISTS idx_app_state_empresa_clave ON app_state(empresa_id,clave);
`);
console.log('031 app_state OK');
