require("dotenv").config();
const fs = require("fs");
const path = require("path");

const dbPath = process.env.DB_PATH || path.join(__dirname, "../data/afip_api.db");

/* Elimina la base demo y sus archivos temporales de SQLite. */
for (const suffix of ["", "-wal", "-shm"]) {
  try {
    fs.rmSync(dbPath + suffix, { force: true });
  } catch (error) {
    console.warn(`[DB] No se pudo eliminar ${dbPath + suffix}: ${error.message}`);
  }
}

console.log("Base eliminada. Ejecutando migraciones, compatibilidad y datos demo...");
require("../src/db/bootstrap")();
console.log("Base demo creada correctamente.");
