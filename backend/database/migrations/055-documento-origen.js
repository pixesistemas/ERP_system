const db = require('../../src/db/database');

/* Documento origen de la factura emitida desde presupuesto / nota de pedido / nota de venta / remito. */
const cols = db.prepare('PRAGMA table_info(documentos_comerciales)').all();
const names = cols.map((c) => c.name);
[
  ['documento_origen_id', 'INTEGER'],
  ['documento_origen_tipo', 'TEXT'],
  ['documento_origen_punto_venta', 'INTEGER'],
  ['documento_origen_numero', 'INTEGER'],
].forEach(([name, type]) => {
  if (!names.includes(name)) {
    db.exec(`ALTER TABLE documentos_comerciales ADD COLUMN ${name} ${type}`);
    console.log(`Columna agregada: documentos_comerciales.${name}`);
  } else {
    console.log(`Columna existente: documentos_comerciales.${name}`);
  }
});