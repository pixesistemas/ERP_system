const db = require("../../src/db/database");

const cols = db.prepare("PRAGMA table_info(empresa_configuraciones)").all().map((c) => c.name);
if (!cols.includes("remito_requiere_nota_pedido")) {
  db.exec("ALTER TABLE empresa_configuraciones ADD COLUMN remito_requiere_nota_pedido INTEGER NOT NULL DEFAULT 1");
  console.log("Columna agregada: empresa_configuraciones.remito_requiere_nota_pedido");
} else {
  console.log("Columna existente: empresa_configuraciones.remito_requiere_nota_pedido");
}