const fs = require('fs');
const path = require('path');
const db = require('./database');
const initDatabase = require('./init');

const MIGRATIONS = [
  '002-add-empresa-profile.js','003-add-pdf-to-facturas.js','004-add-api-key-empresas.js','005-add-whatsapp-autorizados.js','006-add-comercial-module.js','007-add-documento-numeradores.js','008-add-documento-relaciones.js','009-add-users-roles-permissions.js','010-add-refresh-tokens.js','011-add-stock-module.js','012-add-cuenta-corriente-clientes.js','013-add-tesoreria-recibos.js','014-add-pricing-engine.js','015-add-comisiones-vendedores.js','016-add-liquidacion-comisiones.js','017-add-stock-reservas.js','018-add-event-store.js','019-add-business-rules.js','020-add-origen-to-facturas.js','021-add-pdf-documentos-comerciales.js','022-add-empresa-id-clientes-productos.js','023-add-workspaces.js','024-add-business-sessions.js','025-add-conversations.js','026-add-commercial-data-documentos.js','027-add-company-settings.js','028-add-erp-consolidation.js','029-add-purchases-vat-reserve-funds.js','030-add-pos-core.js','031-add-app-state.js','032-normalize-beta2.js','033-pos-account-drafts-print.js','034-reserve-fund-delivery-notes.js','035-add-cae-documentos-comerciales.js','036-add-rol-pantallas.js','037-add-whatsapp-clientes.js','038-fiscal-estado-intentos.js','migrate-add-factura-labels.js','041-pos-agrupar-por-codigo.js','042-add-config-comprobantes.js','043-add-formato-impresion-ventas.js','044-usuario-puntos-venta.js','045-caja-punto-venta.js','046-producto-codigos-barras-pack.js','047-superadmin-licencias.js','048-punto-venta-nombre-fantasia.js','049-borrador-iva.js','050-pos-direccion-vendedor.js','051-remito-subtipo.js','052-pos-contacto.js','053-cobro-temporal.js','054-tema-empresa.js','055-documento-origen.js','056-remito-flujo.js','057-version-instalada.js','058-changelog.js','059-sistema-version.js','060-transferencias-stock.js','061-banco-titular.js','062-reglas-sorteo.js','063-cupones-sorteo.js','064-aplicar-reglas.js','065-auto-eliminar-notax.js','066-whatsapp-moderador.js','067-whatsapp-notificaciones.js','068-whatsapp-config.js','069-whatsapp-opcionales.js','070-config-pie-pegado.js','071-pasarelas-pago.js'
];

function migrate() {
  initDatabase();
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  const dir = path.join(__dirname, '../../database/migrations');
  for (const name of MIGRATIONS) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) throw new Error(`Falta la migración ${name}`);
    delete require.cache[require.resolve(file)];
    require(file);
    db.prepare('INSERT OR IGNORE INTO schema_migrations(name) VALUES (?)').run(name);
  }
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
}
module.exports = migrate;
if (require.main === module) { console.log(`[DB] Migración completa: ${migrate().length} tablas.`); }
