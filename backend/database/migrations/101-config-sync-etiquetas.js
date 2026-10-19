const db = require("../../src/db/database");

/*
 * Configuración de caja/medios de cobro y empresas conectadas.
 *
 * - preguntar_fondo_inicial: al abrir el POS pregunta con cuánto efectivo
 *   inicia la caja.
 * - banco_billetera_id / banco_qr_id: bancos que se usan para registrar los
 *   cobros con billetera electrónica (transferencias) y con QR.
 * - empresas_conectadas: pares de empresas que comparten catálogo y
 *   clientes (se guardan en ambos sentidos).
 */

const cols = db.prepare("PRAGMA table_info(empresa_configuraciones)").all().map((c) => c.name);
for (const [columna, definicion] of [
  ["preguntar_fondo_inicial", "INTEGER NOT NULL DEFAULT 0"],
  ["banco_billetera_id", "INTEGER"],
  ["banco_qr_id", "INTEGER"],
]) {
  if (!cols.includes(columna)) {
    db.exec(`ALTER TABLE empresa_configuraciones ADD COLUMN ${columna} ${definicion}`);
    console.log(`101: empresa_configuraciones.${columna} agregada`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS empresas_conectadas (
    empresa_id INTEGER NOT NULL,
    conectada_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (empresa_id, conectada_id)
  );
`);

console.log("101: configuración de caja y empresas conectadas lista");
