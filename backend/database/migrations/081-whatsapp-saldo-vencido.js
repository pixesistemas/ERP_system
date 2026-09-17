const db = require("../../src/db/database");

/*
 * Interruptor de recordatorios de saldo vencido por WhatsApp.
 * Queda tildado por defecto para no cambiar el comportamiento actual.
 */

const columnas = db
  .prepare("PRAGMA table_info(whatsapp_config)")
  .all()
  .map((c) => c.name);

if (!columnas.includes("enviar_saldo_vencido")) {
  db.exec(
    "ALTER TABLE whatsapp_config ADD COLUMN enviar_saldo_vencido INTEGER NOT NULL DEFAULT 1",
  );
  console.log("081: whatsapp_config.enviar_saldo_vencido agregada");
}
