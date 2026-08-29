const db = require('../../src/db/database');

/* Cada punto de venta puede tener su propio nombre de fantasía para
   imprimir en los comprobantes (mismo CUIT, varios rubros). */
const cols = db.prepare('PRAGMA table_info(puntos_venta)').all().map((x) => x.name);
if (!cols.includes('nombre_fantasia')) {
  db.exec('ALTER TABLE puntos_venta ADD COLUMN nombre_fantasia TEXT');
  console.log('Columna agregada: puntos_venta.nombre_fantasia');
}
