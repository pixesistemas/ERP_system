const db = require("./database");

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      cuit TEXT NOT NULL,
      condicion_iva TEXT NOT NULL,
      punto_venta INTEGER NOT NULL DEFAULT 1,
      production INTEGER NOT NULL DEFAULT 0,
      cert_path TEXT NOT NULL,
      key_path TEXT NOT NULL,
      cache_path TEXT NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      punto_venta INTEGER NOT NULL,
      tipo_comprobante INTEGER NOT NULL,
      letra TEXT,
      comprobante_nombre TEXT,
      numero INTEGER NOT NULL,
      doc_tipo INTEGER,
      doc_nro TEXT,
      importe_neto REAL,
      importe_iva REAL,
      importe_total REAL,
      cae TEXT,
      cae_vencimiento TEXT,
      resultado TEXT,
      request_json TEXT,
      response_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      UNIQUE (empresa_id, punto_venta, tipo_comprobante, numero)
    );
    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuit TEXT UNIQUE,
        dni TEXT,
        razon_social TEXT NOT NULL,
        condicion_iva TEXT,
        domicilio TEXT,
        localidad TEXT,
        provincia TEXT,
        email TEXT,
        telefono TEXT,
        ultima_actualizacion_padron TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS factura_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          factura_id INTEGER NOT NULL,
          codigo TEXT,
          descripcion TEXT NOT NULL,
          cantidad REAL NOT NULL,
          precio_unitario REAL NOT NULL,
          iva_porcentaje REAL,
          subtotal REAL,
          iva_importe REAL,
          total REAL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (factura_id) REFERENCES facturas(id)
        );
        CREATE TABLE IF NOT EXISTS productos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE,
          codigo_barra TEXT,
          descripcion TEXT NOT NULL,
          precio REAL NOT NULL,
          iva REAL NOT NULL DEFAULT 21,
          unidad TEXT DEFAULT 'UN',
          activo INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          evento TEXT NOT NULL,
          entidad TEXT,
          entidad_id TEXT,
          empresa_id INTEGER,
          usuario TEXT,
          origen TEXT,
          datos TEXT
        );
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id INTEGER NOT NULL,
            idempotency_key TEXT NOT NULL,
            request_hash TEXT,
            response_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (empresa_id, idempotency_key)
          );
  `);
}

module.exports = initDatabase;
