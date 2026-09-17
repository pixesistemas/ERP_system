const db = require("../../src/db/database");

/*
 * Rubro del ítem en documentos comerciales y ventas del POS.
 *
 * Los artículos manuales de presupuesto no tienen producto asociado, por
 * eso el rubro elegido al cargarlos se guarda en el propio ítem. Así el
 * Borrador de IVA puede agrupar la venta por rubro aunque el producto no
 * exista en el catálogo.
 */

function agregarColumna(tabla, columna) {
  const columnas = db
    .prepare(`PRAGMA table_info(${tabla})`)
    .all()
    .map((c) => c.name);

  if (!columnas.includes(columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} INTEGER`);
    console.log(`080: ${tabla}.${columna} agregada`);
  }
}

agregarColumna("documento_items", "rubro_id");
agregarColumna("venta_pos_items", "rubro_id");
