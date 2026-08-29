const db = require("../../src/db/database");

/*
 * Configuración por tipo de comprobante:
 * si descuenta stock, si registra cobro en caja, si exige cliente,
 * formato de impresión (A4, 80MM o heredar del punto de venta)
 * y numerador propio ("la numeración que va").
 */
const DEFAULT_CONFIGS = [
  { tipo: "FACTURA", descuenta_stock: 1, registra_caja: 1, requiere_cliente: 0, formato_impresion: "PUNTO_VENTA", numerador_tipo: null },
  { tipo: "NOTA_X", descuenta_stock: 0, registra_caja: 0, requiere_cliente: 0, formato_impresion: "PUNTO_VENTA", numerador_tipo: null },
  { tipo: "NOTA_CREDITO", descuenta_stock: 0, registra_caja: 0, requiere_cliente: 0, formato_impresion: "PUNTO_VENTA", numerador_tipo: null },
  { tipo: "NOTA_DEBITO", descuenta_stock: 0, registra_caja: 0, requiere_cliente: 0, formato_impresion: "PUNTO_VENTA", numerador_tipo: null },
  { tipo: "PRESUPUESTO", descuenta_stock: 0, registra_caja: 0, requiere_cliente: 0, formato_impresion: "PUNTO_VENTA", numerador_tipo: null },
  { tipo: "NOTA_PEDIDO", descuenta_stock: 0, registra_caja: 0, requiere_cliente: 0, formato_impresion: "PUNTO_VENTA", numerador_tipo: null },
  { tipo: "REMITO", descuenta_stock: 1, registra_caja: 0, requiere_cliente: 1, formato_impresion: "PUNTO_VENTA", numerador_tipo: null },
];

db.exec(`
  CREATE TABLE IF NOT EXISTS config_comprobantes (
    empresa_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    descuenta_stock INTEGER NOT NULL DEFAULT 0,
    registra_caja INTEGER NOT NULL DEFAULT 0,
    requiere_cliente INTEGER NOT NULL DEFAULT 0,
    formato_impresion TEXT NOT NULL DEFAULT 'PUNTO_VENTA',
    numerador_tipo TEXT,
    updated_at TEXT,
    PRIMARY KEY (empresa_id, tipo),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );
`);

const empresas = db.prepare("SELECT id FROM empresas").all();
const insert = db.prepare(`
  INSERT OR IGNORE INTO config_comprobantes
    (empresa_id, tipo, descuenta_stock, registra_caja, requiere_cliente, formato_impresion, numerador_tipo)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const empresa of empresas) {
  for (const cfg of DEFAULT_CONFIGS) {
    insert.run(empresa.id, cfg.tipo, cfg.descuenta_stock, cfg.registra_caja, cfg.requiere_cliente, cfg.formato_impresion, cfg.numerador_tipo);
  }
}

console.log("Config Comprobantes: tabla config_comprobantes creada");