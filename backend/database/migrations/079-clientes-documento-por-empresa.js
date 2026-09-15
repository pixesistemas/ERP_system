const db = require("../../src/db/database");

/*
 * clientes.cuit era UNIQUE global: dos empresas no podían tener el mismo
 * cliente (pasa al migrar sistemas viejos, porque comparten clientes). Se
 * reconstruye la tabla y la unicidad pasa a ser por empresa.
 *
 * El índice es parcial (solo CUIT reales) para no chocar con filas sin CUIT.
 */

const tabla = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='clientes'").get();
const yaEsPorEmpresa = !tabla || !/cuit\s+TEXT\s+UNIQUE/i.test(tabla.sql || "");

if (tabla && !yaEsPorEmpresa) {
  const columnas = new Set(db.prepare("PRAGMA table_info(clientes)").all().map((c) => c.name));
  const definiciones = [
    ["id", "id INTEGER PRIMARY KEY AUTOINCREMENT"],
    ["cuit", "cuit TEXT"],
    ["dni", "dni TEXT"],
    ["razon_social", "razon_social TEXT NOT NULL"],
    ["condicion_iva", "condicion_iva TEXT"],
    ["domicilio", "domicilio TEXT"],
    ["localidad", "localidad TEXT"],
    ["provincia", "provincia TEXT"],
    ["email", "email TEXT"],
    ["telefono", "telefono TEXT"],
    ["ultima_actualizacion_padron", "ultima_actualizacion_padron TEXT"],
    ["created_at", "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"],
    ["updated_at", "updated_at TEXT"],
    ["empresa_id", "empresa_id INTEGER"],
    ["descuento_porcentaje", "descuento_porcentaje REAL NOT NULL DEFAULT 0"],
  ].filter(([nombre]) => nombre === "id" || columnas.has(nombre));
  const copiar = definiciones.map(([nombre]) => nombre).join(", ");

  db.pragma("foreign_keys = OFF");
  const migrar = db.transaction(() => {
    db.exec(`CREATE TABLE clientes_nuevo (${definiciones.map(([, def]) => def).join(", ")})`);
    db.exec(`INSERT INTO clientes_nuevo (${copiar}) SELECT ${copiar} FROM clientes`);
    db.exec("DROP TABLE clientes");
    db.exec("ALTER TABLE clientes_nuevo RENAME TO clientes");
    db.exec(
      "CREATE UNIQUE INDEX idx_clientes_empresa_cuit ON clientes(empresa_id, cuit) WHERE cuit IS NOT NULL AND cuit <> ''",
    );
  });
  migrar();
  db.pragma("foreign_keys = ON");
  const fk = db.prepare("SELECT COUNT(*) n FROM pragma_foreign_key_check").get();
  console.log(`079: clientes con CUIT unico por empresa (filas: ${db.prepare("SELECT COUNT(*) n FROM clientes").get().n}, fk rotas: ${fk.n})`);
}
