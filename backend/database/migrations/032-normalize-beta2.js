const db = require('../../src/db/database');

db.exec(`
CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL,
  cuit TEXT, condicion_iva TEXT, domicilio TEXT, telefono TEXT, email TEXT,
  saldo_inicial REAL NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id,cuit), FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS monedas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
  nombre TEXT NOT NULL, simbolo TEXT, cotizacion REAL NOT NULL DEFAULT 1,
  principal INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(empresa_id,codigo),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS rubros_gasto (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1, UNIQUE(empresa_id,nombre), FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS condiciones_pago (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL,
  dias INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE(empresa_id,nombre), FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS tipos_impuesto_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL,
  naturaleza TEXT NOT NULL CHECK(naturaleza IN ('PERCEPCION','RETENCION')),
  activo INTEGER NOT NULL DEFAULT 1, UNIQUE(empresa_id,nombre), FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS descuentos_cantidad (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL,
  producto_codigo TEXT, cantidad_minima REAL NOT NULL, porcentaje REAL NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS promociones_regalo (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL,
  disparador_tipo TEXT NOT NULL, disparador_codigo TEXT, cantidad_minima REAL NOT NULL DEFAULT 0,
  importe_minimo REAL NOT NULL DEFAULT 0, regalo_codigo TEXT NOT NULL, regalo_descripcion TEXT,
  regalo_cantidad REAL NOT NULL DEFAULT 1, activo INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, nombre TEXT NOT NULL,
  precio REAL NOT NULL, activo INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS combo_items (
  combo_id INTEGER NOT NULL, producto_codigo TEXT NOT NULL, cantidad REAL NOT NULL,
  PRIMARY KEY(combo_id,producto_codigo), FOREIGN KEY(combo_id) REFERENCES combos(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS comprobante_plantillas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, tipo TEXT NOT NULL DEFAULT 'GENERAL',
  configuracion_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id,tipo), FOREIGN KEY(empresa_id) REFERENCES empresas(id)
);
CREATE TABLE IF NOT EXISTS banco_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, banco_id INTEGER NOT NULL,
  fecha TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('CREDITO','DEBITO')), concepto TEXT NOT NULL,
  importe REAL NOT NULL, origen_tipo TEXT, origen_id INTEGER, conciliado INTEGER NOT NULL DEFAULT 0,
  fecha_conciliacion TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(empresa_id) REFERENCES empresas(id), FOREIGN KEY(banco_id) REFERENCES bancos(id)
);
CREATE TABLE IF NOT EXISTS ordenes_pago (
  id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, proveedor_id INTEGER NOT NULL,
  numero INTEGER NOT NULL, fecha TEXT NOT NULL, concepto TEXT, efectivo REAL NOT NULL DEFAULT 0,
  transferencia REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'EMITIDA', caja_movimiento_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(empresa_id,numero),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id), FOREIGN KEY(proveedor_id) REFERENCES proveedores(id),
  FOREIGN KEY(caja_movimiento_id) REFERENCES caja_movimientos(id)
);
CREATE TABLE IF NOT EXISTS orden_pago_cheques (
  orden_pago_id INTEGER NOT NULL, cheque_id INTEGER NOT NULL, importe REAL NOT NULL,
  PRIMARY KEY(orden_pago_id,cheque_id), FOREIGN KEY(orden_pago_id) REFERENCES ordenes_pago(id) ON DELETE CASCADE,
  FOREIGN KEY(cheque_id) REFERENCES cheques(id)
);
`);

const cashColumns = db.prepare('PRAGMA table_info(caja_sesiones)').all().map(x => x.name);
for (const [column, definition] of [['arqueo_json',"TEXT NOT NULL DEFAULT '{}'"],['importe_contado','REAL'],['diferencia','REAL'],['observaciones_cierre','TEXT']])
  if (!cashColumns.includes(column)) db.exec(`ALTER TABLE caja_sesiones ADD COLUMN ${column} ${definition}`);
const companyColumns = db.prepare('PRAGMA table_info(empresa_configuraciones)').all().map(x => x.name);
for (const [column, definition] of [['require_cashier_on_start','INTEGER NOT NULL DEFAULT 0'],['require_branch_on_start','INTEGER NOT NULL DEFAULT 0'],['default_branch_id','INTEGER'],['default_pos_id','INTEGER'],['arca_environment',"TEXT NOT NULL DEFAULT 'HOMOLOGACION'"],['company_profile_json',"TEXT NOT NULL DEFAULT '{}'"]])
  if (!companyColumns.includes(column)) db.exec(`ALTER TABLE empresa_configuraciones ADD COLUMN ${column} ${definition}`);

/* Importación única de los catálogos que Beta 1.3 guardaba como JSON. */
if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_state'").get()) {
  const read = key => db.prepare('SELECT empresa_id,valor_json FROM app_state WHERE clave=?').all(key).map(x=>{try{return {...x,value:JSON.parse(x.valor_json)}}catch{return {...x,value:[]}}});
  const imports = [
    ['afip_suppliers_v30','proveedores',['nombre','cuit','condicion_iva','domicilio','telefono','email','saldo_inicial','activo'],r=>[r.nombre||r.razonSocial,r.cuit||null,r.condicionIVA||'',r.domicilio||'',r.telefono||'',r.email||'',Number(r.saldo||0),r.activo===false?0:1]],
    ['afip_currencies_v34','monedas',['codigo','nombre','simbolo','cotizacion','principal','activo'],r=>[r.codigo,r.nombre,r.simbolo||'',Number(r.cotizacion||1),r.principal?1:0,r.activo===false?0:1]],
    ['afip_expense_categories_v40','rubros_gasto',['nombre','activo'],r=>[r.nombre,r.activo===false?0:1]],
    ['afip_payment_terms_v41','condiciones_pago',['nombre','dias','activo'],r=>[r.nombre,Number(r.dias||0),r.activo===false?0:1]],
    ['afip_purchase_tax_kinds_v41','tipos_impuesto_compra',['nombre','naturaleza','activo'],r=>[r.nombre,String(r.naturaleza||'PERCEPCION').toUpperCase(),r.activo===false?0:1]]
  ];
  for (const [key,table,columns,map] of imports) for (const state of read(key)) {
    if (db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE empresa_id=?`).get(state.empresa_id).n) continue;
    const insert=db.prepare(`INSERT OR IGNORE INTO ${table}(empresa_id,${columns.join(',')}) VALUES(?,${columns.map(()=>'?').join(',')})`);
    for(const row of (Array.isArray(state.value)?state.value:[])) insert.run(state.empresa_id,...map(row));
  }
  const normalizedKeys=['afip_suppliers_v30','afip_currencies_v34','afip_expense_categories_v40','afip_payment_terms_v41','afip_purchase_tax_kinds_v41','afip_sellers_v31','afip_branches_v32','afip_cashiers_v32','afip_point_sales_v35','afip_banks_v32','afip_checks_v30','afip_discount_rules_v35','afip_gift_promotions_v35','afip_combo_rules_v35','afip_bank_moves_v32','afip_check_deposits_v35','afip_payment_orders_v35','afip_company_v31','afip_designer_v40'];
  db.prepare(`DELETE FROM app_state WHERE clave IN (${normalizedKeys.map(()=>'?').join(',')})`).run(...normalizedKeys);
}

console.log('032 normalizacion Beta 2 aplicada');
