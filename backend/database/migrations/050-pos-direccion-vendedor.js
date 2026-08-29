const db = require('../../src/db/database');

/* Cada punto de venta puede tener su propia dirección opcional para
   imprimir en comprobantes y encabezados de reportes. Además, cada
   comprobante puede exigir (o no) seleccionar un vendedor en la venta. */
const posCols = db.prepare('PRAGMA table_info(puntos_venta)').all().map((x) => x.name);
if (!posCols.includes('direccion')) {
  db.exec('ALTER TABLE puntos_venta ADD COLUMN direccion TEXT');
  console.log('Columna agregada: puntos_venta.direccion');
}

const cfgCols = db.prepare('PRAGMA table_info(config_comprobantes)').all().map((x) => x.name);
if (!cfgCols.includes('requiere_vendedor')) {
  db.exec('ALTER TABLE config_comprobantes ADD COLUMN requiere_vendedor INTEGER DEFAULT 0');
  console.log('Columna agregada: config_comprobantes.requiere_vendedor');
}