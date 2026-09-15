const db = require("../../src/db/database");

/*
 * productos.codigo era UNIQUE global, lo que impedía que dos empresas usaran
 * el mismo código interno. Al migrar sistemas viejos los códigos se repiten
 * entre clientes, así que la unicidad debe ser por empresa.
 *
 * SQLite no permite quitar una restricción UNIQUE de una columna: hay que
 * reconstruir la tabla. Se copian sólo las columnas que existan en cada base
 * (las columnas comerciales se agregan por compatibilidad en instalaciones
 * nuevas), conservando ids, datos y la secuencia AUTOINCREMENT.
 */

const tabla = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='productos'").get();
const yaEsPorEmpresa = !tabla || !/codigo\s+TEXT\s+UNIQUE/i.test(tabla.sql || "");

if (tabla && !yaEsPorEmpresa) {
  const columnas = new Set(db.prepare("PRAGMA table_info(productos)").all().map((c) => c.name));
  const base = [
    ["id", "id INTEGER PRIMARY KEY AUTOINCREMENT"],
    ["codigo", "codigo TEXT"],
    ["codigo_barra", "codigo_barra TEXT"],
    ["descripcion", "descripcion TEXT NOT NULL"],
    ["precio", "precio REAL NOT NULL"],
    ["iva", "iva REAL NOT NULL DEFAULT 21"],
    ["unidad", "unidad TEXT DEFAULT 'UN'"],
    ["activo", "activo INTEGER NOT NULL DEFAULT 1"],
    ["created_at", "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"],
    ["updated_at", "updated_at TEXT"],
    ["empresa_id", "empresa_id INTEGER"],
  ];
  const extras = [
    ["costo", "costo REAL NOT NULL DEFAULT 0"],
    ["utilidad", "utilidad REAL NOT NULL DEFAULT 0"],
    ["rubro_id", "rubro_id INTEGER"],
    ["subrubro_id", "subrubro_id INTEGER"],
    ["marca_id", "marca_id INTEGER"],
    ["unidad_id", "unidad_id INTEGER"],
  ];
  const definiciones = base.concat(extras).filter(([nombre]) => nombre === "id" || columnas.has(nombre));
  const copiar = definiciones.map(([nombre]) => nombre).join(", ");

  db.pragma("foreign_keys = OFF");
  const migrar = db.transaction(() => {
    db.exec(`CREATE TABLE productos_nuevo (${definiciones.map(([, def]) => def).join(", ")})`);
    db.exec(`INSERT INTO productos_nuevo (${copiar}) SELECT ${copiar} FROM productos`);
    db.exec("DROP TABLE productos");
    db.exec("ALTER TABLE productos_nuevo RENAME TO productos");
    db.exec("CREATE UNIQUE INDEX idx_productos_empresa_codigo ON productos(empresa_id, codigo)");
  });
  migrar();
  db.pragma("foreign_keys = ON");
  const fk = db.prepare("SELECT COUNT(*) n FROM pragma_foreign_key_check").get();
  console.log(`078: productos con codigo unico por empresa (filas: ${db.prepare("SELECT COUNT(*) n FROM productos").get().n}, fk rotas: ${fk.n})`);
}
