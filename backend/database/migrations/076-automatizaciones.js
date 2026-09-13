const db = require("../../src/db/database");

/*
 * Automatizaciones configurables por empresa (las activa el cliente) y
 * aviso de errores del sistema por WhatsApp al superadmin.
 *
 * Cada flag vive en empresa_configuraciones. El ERP sólo ejecuta la
 * automatización si el flag está en 1; n8n dispara el cron y consulta.
 */

function addCol(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log(`${table}.${col} agregada.`);
  }
}

addCol("empresa_configuraciones", "auto_reporte_diario", "INTEGER NOT NULL DEFAULT 0");
addCol("empresa_configuraciones", "auto_reporte_hora", "TEXT DEFAULT '21:00'");
addCol("empresa_configuraciones", "auto_reporte_email", "TEXT");
addCol("empresa_configuraciones", "auto_stock_minimo", "INTEGER NOT NULL DEFAULT 0");
addCol("empresa_configuraciones", "auto_stock_telefono", "TEXT");
addCol("empresa_configuraciones", "auto_reintento_cae", "INTEGER NOT NULL DEFAULT 0");
addCol("empresa_configuraciones", "auto_cobranzas", "INTEGER NOT NULL DEFAULT 0");
addCol("empresa_configuraciones", "auto_cobranzas_dias", "INTEGER NOT NULL DEFAULT 7");
addCol("empresa_configuraciones", "auto_cobranzas_hora", "TEXT DEFAULT '10:00'");
addCol("empresa_configuraciones", "auto_backup", "INTEGER NOT NULL DEFAULT 0");
addCol("empresa_configuraciones", "auto_backup_hora", "TEXT DEFAULT '03:00'");
addCol("empresa_configuraciones", "auto_avisar_reparto", "INTEGER NOT NULL DEFAULT 0");
addCol("empresa_configuraciones", "auto_escalar_humano", "INTEGER NOT NULL DEFAULT 0");
addCol("empresa_configuraciones", "auto_escalar_telefono", "TEXT");

addCol("super_admins", "telefono", "TEXT");
addCol("super_admins", "whatsapp_activo", "INTEGER NOT NULL DEFAULT 0");

const alertas = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_alertas'")
  .get();
if (!alertas) {
  db.exec(`
    CREATE TABLE error_alertas (
      signature TEXT PRIMARY KEY,
      enviada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      veces INTEGER NOT NULL DEFAULT 1
    )
  `);
  console.log("Tabla error_alertas creada.");
}
