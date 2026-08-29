const db = require('../../src/db/database');

/* Módulo Borrador IVA: ajustes de restitución de crédito/débito por
   período y catálogo persistente de rubros de productos (agrupación del
   débito fiscal). */
db.exec(`
CREATE TABLE IF NOT EXISTS borrador_iva_ajustes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  mes_iva INTEGER NOT NULL,
  anio_iva INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('RESTITUCION_CREDITO','RESTITUCION_DEBITO')),
  importe REAL NOT NULL DEFAULT 0,
  detalle TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (empresa_id, mes_iva, anio_iva, tipo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);
`);

const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
if (!tablas.includes('rubros_productos')) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS rubros_productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (empresa_id, nombre),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );
  `);
  const hayProductos = tablas.includes('productos') &&
    db.prepare("PRAGMA table_info(productos)").all().some(c => c.name === 'rubro_id');
  if (hayProductos) {
    const ids = db
      .prepare(
        `SELECT DISTINCT rubro_id FROM productos
         WHERE rubro_id IS NOT NULL ORDER BY rubro_id`,
      )
      .all();

    const ins = db.prepare(
      `INSERT OR IGNORE INTO rubros_productos(empresa_id, nombre) VALUES(?, ?)`,
    );

    for (const row of ids) {
      ins.run(1, `RUBRO ${row.rubro_id}`);
    }

    console.log(`Tabla rubros_productos creada (${ids.length} rubros sembrados)`);
  } else {
    console.log('Tabla rubros_productos creada (sin catálogo de productos para sembrar)');
  }
}