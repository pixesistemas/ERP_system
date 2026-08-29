const db = require('../../src/db/database');

/* Los remitos distinguen su naturaleza en el subtipo:
   R = remito para facturar después (interno, sin envío a ARCA),
   X = remito de movimiento interno/local (valor por defecto).
   Ninguno se comunica con el webservice: es solo clasificación local. */
const docCols = db.prepare('PRAGMA table_info(documentos_comerciales)').all().map((x) => x.name);
if (!docCols.includes('subtipo')) {
  db.exec('ALTER TABLE documentos_comerciales ADD COLUMN subtipo TEXT');
  console.log('Columna agregada: documentos_comerciales.subtipo');
}