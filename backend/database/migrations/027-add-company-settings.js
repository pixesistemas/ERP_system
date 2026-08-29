const db = require("../../src/db/database");

/*
 * Crea la configuración operativa por empresa antes de cargar los datos demo.
 * Esta tabla es utilizada por stock, alertas, logo y formato de recibos.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS empresa_configuraciones (
    empresa_id INTEGER PRIMARY KEY,
    stock_policy TEXT NOT NULL DEFAULT 'WARN',
    stock_alerts_enabled INTEGER NOT NULL DEFAULT 1,
    stock_alert_dashboard INTEGER NOT NULL DEFAULT 1,
    logo_url TEXT,
    recibo_doble_copia INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );
`);

console.log("Configuración por empresa creada");
