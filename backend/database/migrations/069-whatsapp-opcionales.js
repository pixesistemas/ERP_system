const db = require("../../src/db/database");

const cols = db.prepare("PRAGMA table_info(documentos_comerciales)").all().map((c) => c.name);
if (!cols.includes("estado_reparto")) {
  db.exec("ALTER TABLE documentos_comerciales ADD COLUMN estado_reparto TEXT");
  console.log("Columna agregada: documentos_comerciales.estado_reparto");
} else {
  console.log("Columna existente: documentos_comerciales.estado_reparto");
}

const cols2 = db.prepare("PRAGMA table_info(whatsapp_config)").all().map((c) => c.name);
if (!cols2.includes("mercado_pago_link")) {
  db.exec("ALTER TABLE whatsapp_config ADD COLUMN mercado_pago_link TEXT");
  console.log("Columna agregada: whatsapp_config.mercado_pago_link");
}
if (!cols2.includes("ia_api_key")) {
  db.exec("ALTER TABLE whatsapp_config ADD COLUMN ia_api_key TEXT");
  console.log("Columna agregada: whatsapp_config.ia_api_key");
}