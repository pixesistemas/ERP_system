const db = require('../../src/db/database');

/* Datos de contacto opcionales por punto de venta, para mostrar en
   comprobantes y encabezados de reportes (teléfono, WhatsApp y email). */
const cols = db.prepare('PRAGMA table_info(puntos_venta)').all().map((x) => x.name);
for (const [name, def] of [['telefono', 'TEXT'], ['whatsapp', 'TEXT'], ['email', 'TEXT']]) {
  if (!cols.includes(name)) {
    db.exec(`ALTER TABLE puntos_venta ADD COLUMN ${name} ${def}`);
    console.log(`Columna agregada: puntos_venta.${name}`);
  }
}