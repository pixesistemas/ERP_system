const db = require("../../src/db/database");

db.exec(`
  CREATE TABLE IF NOT EXISTS sistema_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const row = db.prepare("SELECT version FROM sistema_version WHERE id=1").get();
if (!row) {
  db.prepare("INSERT INTO sistema_version(id,version) VALUES(1,'4.0.0-beta.2.2')").run();
  console.log("sistema_version creada con versión 4.0.0-beta.2.2");
} else {
  console.log("sistema_version existente: " + row.version);
}