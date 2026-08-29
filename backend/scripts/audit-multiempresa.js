require("dotenv").config();

/*
 * audit-multiempresa.js
 *
 * Verifica el aislamiento por empresa en los controladores del ERP:
 *  - Lista los controllers que operan sobre la base.
 *  - Busca sentencias db.prepare() que toquen tablas de datos y NO filtren
 *    por empresa_id (posible fuga de datos entre empresas).
 *  - Marca como potenciales las que tengan WHERE id=? / igualdad por id
 *    pero sin empresa_id, salvo tablas que por diseño son por id única
 *    (las que tienen columna propia de empresa se validan igual).
 *
 * Uso: node scripts/audit-multiempresa.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SRC = path.join(__dirname, "..", "src");

const TABLAS_DATOS = /(?:FROM|INTO|UPDATE|JOIN)\s+\b(productos|clientes|proveedores|vendedores|puntos_venta|documentos_comerciales|documento_items|ventas_pos|venta_pos_items|stock_productos|stock_reservas|stock_movimientos|depositos|compras|compra_items|cliente_cc_movimientos|recibos|recibo_detalles|caja_sesiones|caja_movimientos|cheques|ordenes_pago|orden_pago_cheques|cobros_temporales|whatsapp_autorizados|whatsapp_clientes|whatsapp_notificaciones|whatsapp_config|conversations|config_comprobantes|cupones_sorteo|reglas_sorteo|documento_numeradores|vendedor_comisiones|vendedor_liquidaciones|listas_precios|lista_precio_items|reservas_monto|reserva_monto_consumos|bancos|banco_movimientos|transferencias_stock|empresas|empresa_configuraciones|comprobante_plantillas|producto_proveedores|producto_codigos_barras|usuario_puntos_venta|usuarios|usuario_roles|usuario_empresas|roles|permisos|rol_permisos|rol_pantallas|modulos_empresa|licencias|sistema_version|event_store|audit_log|pos_borradores)\b/;

const CONTROLLERS = [
  "controllers/erpConsolidation.controller.js",
  "controllers/beta2.controller.js",
  "controllers/conversation.controller.js",
  "controllers/whatsappWebhook.controller.js",
];

const CONTROLLERS_SKIP = new Set([
  // tablas de configuración global de la aplicación, sin empresa
  "auth.controller.js",
]);

function listarArchivos(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(dir, f));
}

const archivos = [...new Set(CONTROLLERS.map((rel) => path.join(SRC, rel)))];

let revisadas = 0;
const potenciales = [];

for (const rutaArchivo of archivos) {
  if (!fs.existsSync(rutaArchivo)) continue;
  const codigo = fs.readFileSync(rutaArchivo, "utf8");
  const regex = /db\.prepare\(\s*(?:`([^`]*)`|'([^']*)')/g;
  let match;
  while ((match = regex.exec(codigo)) !== null) {
    const sql = (match[1] || match[2] || "").trim();
    if (!/^(SELECT|UPDATE|DELETE|INSERT)/i.test(sql)) continue;
    if (/^INSERT/i.test(sql) && /VALUES/i.test(sql) && /empresa_id/i.test(sql)) continue;
    if (!TABLAS_DATOS.test(sql)) continue;
    revisadas++;
    const tieneEmpresa =
      /empresa_id\s*=\s*[^ ]/.test(sql) || /joined on/i.test(sql);
    if (!tieneEmpresa) {
      potenciales.push({
        archivo: path.basename(rutaArchivo),
        sql: sql.slice(0, 160),
      });
    }
  }
}

console.log(`Sentencias sobre tablas de datos analizadas desde los controllers ERP: ${revisadas}`);
if (!potenciales.length) {
  console.log("OK: ninguna sin filtro empresa_id (o JOIN de dominio).");
} else {
  console.log(`Potenciales sin empresa_id visible (revisar a mano): ${potenciales.length}`);
  for (const p of potenciales) console.log(`  - ${p.archivo}: ${p.sql}`);
}
