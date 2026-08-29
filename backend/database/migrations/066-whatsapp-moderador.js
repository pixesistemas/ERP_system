const db = require("../../src/db/database");

const cols = db.prepare("PRAGMA table_info(conversations)").all().map((c) => c.name);
if (!cols.includes("moderador")) {
  db.exec("ALTER TABLE conversations ADD COLUMN moderador INTEGER NOT NULL DEFAULT 0");
  console.log("Columna agregada: conversations.moderador");
} else {
  console.log("Columna existente: conversations.moderador");
}