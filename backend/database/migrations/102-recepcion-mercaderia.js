const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS recepciones_mercaderia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    uuid TEXT NOT NULL,
    proveedor_id INTEGER,
    proveedor_nombre TEXT,
    proveedor_documento TEXT,
    proveedor_condicion_iva TEXT,
    proveedor_domicilio TEXT,
    tipo_comprobante TEXT,
    letra TEXT,
    punto_venta INTEGER,
    numero TEXT,
    fecha TEXT,
    fecha_vencimiento TEXT,
    condicion_pago TEXT,
    moneda TEXT NOT NULL DEFAULT 'PES',
    cotizacion REAL NOT NULL DEFAULT 1,
    deposito_id INTEGER NOT NULL,
    origen TEXT NOT NULL DEFAULT 'MANUAL',
    crear_factura INTEGER NOT NULL DEFAULT 0,
    actualizar_costo INTEGER NOT NULL DEFAULT 0,
    actualizar_precio INTEGER NOT NULL DEFAULT 0,
    costo_incluye_iva INTEGER NOT NULL DEFAULT 0,
    margen_porcentaje REAL NOT NULL DEFAULT 30,
    permitir_parcial INTEGER NOT NULL DEFAULT 0,
    permitir_diferencia_total INTEGER NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    iva REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    total_documento REAL NOT NULL DEFAULT 0,
    exento_no_gravado REAL NOT NULL DEFAULT 0,
    percepciones REAL NOT NULL DEFAULT 0,
    diferencia_total REAL NOT NULL DEFAULT 0,
    observaciones TEXT,
    archivo_nombre TEXT,
    archivo_mime TEXT,
    archivo_path TEXT,
    archivo_url TEXT,
    ocr_json TEXT,
    estado TEXT NOT NULL DEFAULT 'BORRADOR',
    compra_id INTEGER,
    usuario_id INTEGER,
    confirmado_por INTEGER,
    confirmado_en TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    FOREIGN KEY (deposito_id) REFERENCES depositos(id),
    FOREIGN KEY (compra_id) REFERENCES compras(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (confirmado_por) REFERENCES usuarios(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_recepciones_uuid
    ON recepciones_mercaderia(empresa_id, uuid);

  CREATE INDEX IF NOT EXISTS idx_recepciones_estado
    ON recepciones_mercaderia(empresa_id, estado, id DESC);

  CREATE TABLE IF NOT EXISTS recepcion_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recepcion_id INTEGER NOT NULL,
    linea INTEGER NOT NULL DEFAULT 0,
    producto_id INTEGER,
    codigo TEXT,
    codigo_barra TEXT,
    descripcion TEXT,
    codigo_proveedor TEXT,
    cantidad_facturada REAL NOT NULL DEFAULT 0,
    cantidad_recibida REAL NOT NULL DEFAULT 0,
    unidad TEXT NOT NULL DEFAULT 'UN',
    costo_unitario REAL NOT NULL DEFAULT 0,
    costo_neto REAL NOT NULL DEFAULT 0,
    descuento REAL NOT NULL DEFAULT 0,
    iva REAL NOT NULL DEFAULT 21,
    importe REAL NOT NULL DEFAULT 0,
    precio_venta_actual REAL NOT NULL DEFAULT 0,
    precio_venta_nuevo REAL,
    precio_venta_manual INTEGER NOT NULL DEFAULT 0,
    costo_anterior REAL,
    precio_anterior REAL,
    stock_actual REAL NOT NULL DEFAULT 0,
    estado_identificacion TEXT NOT NULL DEFAULT 'PENDIENTE',
    diferencia_motivo TEXT,
    revisar INTEGER NOT NULL DEFAULT 0,
    confianza TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recepcion_id) REFERENCES recepciones_mercaderia(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_recepcion_items_recepcion
    ON recepcion_items(recepcion_id, linea);

  CREATE TABLE IF NOT EXISTS recepcion_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recepcion_id INTEGER NOT NULL,
    empresa_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    detalle TEXT,
    usuario_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recepcion_id) REFERENCES recepciones_mercaderia(id) ON DELETE CASCADE,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);

function asegurarColumna(tabla, columna, definicion) {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);
  if (!columnas.includes(columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

asegurarColumna("recepciones_mercaderia", "exento_no_gravado", "REAL NOT NULL DEFAULT 0");
asegurarColumna("recepciones_mercaderia", "percepciones", "REAL NOT NULL DEFAULT 0");
asegurarColumna("recepcion_items", "precio_venta_manual", "INTEGER NOT NULL DEFAULT 0");

const permisos = [
  ["recepcion.importar", "Importar facturas/listas para recibir mercadería"],
  ["recepcion.gestionar", "Crear y editar recepciones de mercadería"],
  ["recepcion.confirmar", "Confirmar recepciones y mover stock"],
  ["recepcion.anular", "Anular recepciones en borrador"],
  ["compras.gestionar", "Generar y administrar compras desde recepción"],
  ["productos.costos", "Actualizar costos desde recepciones"],
  ["productos.precios", "Actualizar precios de venta desde recepciones"],
];

const insertarPermiso = db.prepare(
  "INSERT OR IGNORE INTO permisos(codigo, descripcion) VALUES (?, ?)",
);
for (const [codigo, descripcion] of permisos) {
  insertarPermiso.run(codigo, descripcion);
}

const rolesAdmin = db
  .prepare("SELECT id FROM roles WHERE UPPER(nombre) = 'ADMIN'")
  .all();
const insertarRolPermiso = db.prepare(
  "INSERT OR IGNORE INTO rol_permisos(rol_id, permiso_id) VALUES (?, ?)",
);
const buscarPermiso = db.prepare("SELECT id FROM permisos WHERE codigo = ?");
for (const rol of rolesAdmin) {
  for (const [codigo] of permisos) {
    const permiso = buscarPermiso.get(codigo);
    if (permiso) insertarRolPermiso.run(rol.id, permiso.id);
  }
}

const novedadTitulo = "Recepción de mercadería con OCR";
if (!db.prepare("SELECT id FROM changelog WHERE version=? AND titulo=? LIMIT 1").get("4.0.0-beta.2.3", novedadTitulo)) {
  db.prepare(
    "INSERT INTO changelog(version,fecha,tipo,titulo,detalle) VALUES(?,?,?,?,?)",
  ).run(
    "4.0.0-beta.2.3",
    "2026-10-24",
    "MEJORA",
    novedadTitulo,
    "Nueva pantalla para recibir facturas, remitos y listas: OCR de cabecera y renglones, matching por código/CUIT, ingreso de stock por depósito, compra opcional y actualización de costos/precios con auditoría.",
  );
}

console.log("102: recepción de mercadería y permisos aplicados");
