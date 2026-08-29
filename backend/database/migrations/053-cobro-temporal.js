const db = require('../../src/db/database');

/* Módulo "Cobro temporal": activable por el programador por empresa.
   - modulos_empresa: banderas de activación de módulos opcionales.
   - cobros_temporales: cobranzas anotadas en una grilla para imprimir y
     entregar a los vendedores; luego pueden marcarse y enviarse a la
     cuenta corriente del cliente. */
db.exec(`
CREATE TABLE IF NOT EXISTS modulos_empresa (
  empresa_id INTEGER NOT NULL,
  modulo TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (empresa_id, modulo)
)`);
console.log('Tabla creada: modulos_empresa');

db.exec(`
CREATE TABLE IF NOT EXISTS cobros_temporales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  cliente_id INTEGER,
  cliente_nombre TEXT NOT NULL,
  importe REAL NOT NULL DEFAULT 0,
  observacion TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  usuario_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_cc_at TEXT
)`);
console.log('Tabla creada: cobros_temporales');