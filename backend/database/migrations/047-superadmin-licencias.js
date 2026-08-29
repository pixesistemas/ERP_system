const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS super_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS licencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    plan TEXT NOT NULL CHECK (plan IN ('MENSUAL','TRIMESTRAL','DEFINITIVO')),
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

  CREATE INDEX IF NOT EXISTS idx_licencias_empresa
    ON licencias (empresa_id);
`);