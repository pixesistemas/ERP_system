const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS listas_precios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    activa INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    UNIQUE (empresa_id, nombre)
  );

  CREATE TABLE IF NOT EXISTS lista_precio_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lista_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    precio REAL NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (lista_id) REFERENCES listas_precios(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    UNIQUE (lista_id, producto_id)
  );

  CREATE TABLE IF NOT EXISTS descuentos_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    cliente_doc TEXT NOT NULL,
    producto_id INTEGER,
    porcentaje REAL NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );
`);

console.log("Pricing Engine creado");
