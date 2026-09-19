const db = require("../../src/db/database");

/*
 * Etapa 1 del sistema de pedidos móviles (preventa) + reparto.
 *
 * Agrega la base sin tocar lo existente:
 *  - vínculo usuario <-> vendedor
 *  - ubicación y marca "cliente de pedidos" en clientes
 *  - cartera manual de clientes por vendedor
 *  - visitas de vendedores (con GPS y resultado)
 *  - historial de estados de pedidos (trazabilidad)
 *  - rutas de reparto y sus pedidos
 *  - dispositivos y cola de sincronización de la PWA
 *  - uuid en ventas para sincronización idempotente
 *  - rol REPARTIDOR
 */

function columnas(tabla) {
  return db
    .prepare(`PRAGMA table_info(${tabla})`)
    .all()
    .map((c) => c.name);
}

function agregarColumna(tabla, columna, definicion) {
  if (!columnas(tabla).includes(columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
    console.log(`083: ${tabla}.${columna} agregada`);
  }
}

agregarColumna("vendedores", "usuario_id", "INTEGER");
agregarColumna("clientes", "latitud", "REAL");
agregarColumna("clientes", "longitud", "REAL");
agregarColumna("clientes", "cliente_pedidos", "INTEGER NOT NULL DEFAULT 0");
agregarColumna("ventas_pos", "uuid", "TEXT");

db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_pos_uuid ON ventas_pos(empresa_id, uuid) WHERE uuid IS NOT NULL",
);

db.exec(`
  CREATE TABLE IF NOT EXISTS vendedor_clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    vendedor_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (empresa_id, vendedor_id, cliente_id)
  );

  CREATE TABLE IF NOT EXISTS visitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    vendedor_id INTEGER,
    cliente_id INTEGER,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    latitud REAL,
    longitud REAL,
    resultado TEXT NOT NULL DEFAULT 'SIN_PEDIDO',
    observaciones TEXT,
    uuid TEXT,
    dispositivo TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_visitas_uuid
    ON visitas(empresa_id, uuid) WHERE uuid IS NOT NULL;

  CREATE TABLE IF NOT EXISTS pedido_estado_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    venta_id INTEGER,
    documento_id INTEGER,
    estado TEXT NOT NULL,
    estado_anterior TEXT,
    usuario_id INTEGER,
    usuario_nombre TEXT,
    detalle TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rutas_reparto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    numero TEXT NOT NULL,
    fecha TEXT NOT NULL,
    repartidor_id INTEGER,
    usuario_id INTEGER,
    estado TEXT NOT NULL DEFAULT 'ARMADA',
    observaciones TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ruta_pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    ruta_id INTEGER NOT NULL,
    venta_id INTEGER NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    estado_entrega TEXT NOT NULL DEFAULT 'PENDIENTE',
    fecha_entrega TEXT,
    hora_entrega TEXT,
    latitud REAL,
    longitud REAL,
    observaciones TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ruta_id, venta_id)
  );

  CREATE TABLE IF NOT EXISTS sync_dispositivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    usuario_id INTEGER,
    device_id TEXT NOT NULL,
    plataforma TEXT,
    app_version TEXT,
    ultima_sync TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (empresa_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS sync_cola (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    usuario_id INTEGER,
    device_id TEXT,
    tipo TEXT NOT NULL,
    uuid TEXT NOT NULL,
    payload_json TEXT,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    procesado_at TEXT,
    UNIQUE (empresa_id, uuid)
  );
`);

const rolRepartidor = db
  .prepare("SELECT id FROM roles WHERE nombre='REPARTIDOR'")
  .get();

if (!rolRepartidor) {
  db.prepare(
    "INSERT INTO roles(nombre,descripcion) VALUES('REPARTIDOR','Reparto y hoja de ruta')",
  ).run();
  console.log("083: rol REPARTIDOR creado");
}

console.log("083: base de preventa y reparto lista");
