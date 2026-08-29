const fs = require("fs");
const path = require("path");
const migrate = require("./migrate");
const ensureSchemaCompatibility = require("./schemaCompatibility");
const seedDemo = require("./seedDemo");

/* Crea una copia de seguridad antes de modificar una base existente. */
function backup() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "../../data/afip_api.db");
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return;

  const dir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(dbPath, path.join(dir, `afip_api-${stamp}.db`));
}

/*
 * Prepara la base en el orden correcto:
 * 1) tablas y migraciones, 2) compatibilidad, 3) datos de demostración.
 */
function bootstrap() {
  backup();
  const tables = migrate();
  ensureSchemaCompatibility();
  const seed = seedDemo();
  console.log(`[DB] Lista: ${tables.length} tablas. Admin: ${seed.usuario}`);
  return { tables, seed };
}

module.exports = bootstrap;
