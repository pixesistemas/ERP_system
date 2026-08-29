const db = require("../../src/db/database");

// Crea las tablas necesarias para guardar operaciones comerciales en curso.
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    usuario_id INTEGER,

    canal TEXT NOT NULL DEFAULT 'API',
    telefono_origen TEXT,

    tipo_operacion TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'BORRADOR',

    cliente_id INTEGER,
    vendedor_id INTEGER,

    condicion_venta TEXT DEFAULT 'CONTADO',
    lista_precio TEXT DEFAULT 'GENERAL',

    descuento_general REAL NOT NULL DEFAULT 0,

    observaciones TEXT,
    fecha_entrega TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
  );

  CREATE TABLE IF NOT EXISTS workspace_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    workspace_id INTEGER NOT NULL,
    producto_id INTEGER,

    codigo TEXT,
    descripcion TEXT NOT NULL,
    unidad TEXT DEFAULT 'UN',

    cantidad REAL NOT NULL DEFAULT 1,
    precio_unitario REAL NOT NULL DEFAULT 0,
    descuento REAL NOT NULL DEFAULT 0,
    iva REAL NOT NULL DEFAULT 21,

    subtotal REAL NOT NULL DEFAULT 0,
    iva_importe REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,

    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );

  CREATE TABLE IF NOT EXISTS workspace_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    workspace_id INTEGER NOT NULL,
    evento TEXT NOT NULL,
    descripcion TEXT,
    datos TEXT,

    usuario_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);

console.log("Workspace Engine: tablas creadas");
