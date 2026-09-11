const bcrypt = require('bcryptjs');
const db = require('./database');
const { seedEsencial, asegurarSuperadmin } = require('./seedEsencial');

function seedDemo() {
  const demo = process.env.DEMO_MODE !== 'false';
  // En producción solo se crean permisos, rol ADMIN y el superadmin.
  // La empresa demo y el usuario admin@empresa.com NO se crean.
  if (!demo) {
    seedEsencial();
    const sa = asegurarSuperadmin(false);
    return { empresaId: null, usuario: null, superadmin: 'superadmin', ...sa };
  }
  let empresa = db.prepare("SELECT id FROM empresas WHERE nombre='PixeSistemas'").get() || db.prepare("SELECT id FROM empresas WHERE nombre='empresa1'").get();
  if (!empresa) {
    db.prepare(`INSERT INTO empresas (nombre,cuit,condicion_iva,punto_venta,production,cert_path,key_path,cache_path,activa) VALUES ('empresa1','20939802593','RI',1,0,'src/certificates/empresa1/cert.crt','src/certificates/empresa1/private.key','src/cache/empresa1',1) ON CONFLICT(nombre) DO NOTHING`).run();
    empresa = db.prepare("SELECT id FROM empresas WHERE nombre='empresa1'").get();
  }
  db.prepare(`UPDATE empresas SET razon_social=CASE WHEN nombre='PixeSistemas' THEN 'PixeSistemas' ELSE 'Empresa Demo S.R.L.' END, nombre_fantasia=CASE WHEN nombre='PixeSistemas' THEN 'PixeSistemas' ELSE 'Empresa Demo' END, direccion='Concordia, Entre Ríos', telefono='0345-4000000', email='admin@empresa.com' WHERE id=?`).run(empresa.id);
  const perms=['facturas.emitir','facturas.consultar','documentos.crear','documentos.consultar','documentos.convertir','productos.gestionar','clientes.gestionar','usuarios.gestionar','stock.gestionar','stock.consultar','clientes.cc.consultar','clientes.cc.cobrar','recibos.crear','recibos.consultar','recibos.confirmar','comisiones.consultar','comisiones.liquidar','stock.reservar','procesos.consultar','procesos.ejecutar','workspaces.consultar','workspaces.gestionar','workspaces.confirmar','sessions.consultar','sessions.gestionar','conversations.consultar','conversations.gestionar'];
  for(const p of perms) db.prepare('INSERT OR IGNORE INTO permisos(codigo,descripcion) VALUES (?,?)').run(p,p);
  db.prepare("INSERT OR IGNORE INTO roles(nombre,descripcion) VALUES ('ADMIN','Administrador general')").run();
  const hash=bcrypt.hashSync('admin123',10);
  db.prepare(`INSERT INTO usuarios(nombre,email,telefono,password_hash,activo) VALUES ('Administrador','admin@empresa.com','5493450000000',?,1) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, activo=1`).run(hash);
  const user=db.prepare("SELECT id FROM usuarios WHERE email='admin@empresa.com'").get();
  const role=db.prepare("SELECT id FROM roles WHERE nombre='ADMIN'").get();
  db.prepare('INSERT OR IGNORE INTO usuario_empresas(usuario_id,empresa_id,activo) VALUES (?,?,1)').run(user.id,empresa.id);
  db.prepare('INSERT OR IGNORE INTO usuario_roles(usuario_id,empresa_id,rol_id) VALUES (?,?,?)').run(user.id,empresa.id,role.id);
  for(const row of db.prepare('SELECT id FROM permisos').all()) db.prepare('INSERT OR IGNORE INTO rol_permisos(rol_id,permiso_id) VALUES (?,?)').run(role.id,row.id);
  if(!db.prepare("SELECT id FROM depositos WHERE empresa_id=? AND nombre='Depósito Principal'").get(empresa.id)) db.prepare("INSERT INTO depositos(empresa_id,nombre,activo) VALUES (?,'Depósito Principal',1)").run(empresa.id);
  const products=[['CEM25','779000000001','CEMENTO PORTLAND X 25 KG',7830.01,21,'BOLSA'],['CAL25','779000000002','CAL HIDRATADA X 25 KG',4650,21,'BOLSA'],['HIE06','779000000003','BARRA DE HIERRO NERVADO 6 MM',6900,21,'UN'],['AREM3','779000000004','ARENA FINA POR M3',32500,21,'M3']];
  for(const p of products) db.prepare(`INSERT INTO productos(empresa_id,codigo,codigo_barra,descripcion,precio,iva,unidad,activo,updated_at) VALUES (?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(codigo) DO UPDATE SET empresa_id=excluded.empresa_id,codigo_barra=excluded.codigo_barra,descripcion=excluded.descripcion,precio=excluded.precio,iva=excluded.iva,unidad=excluded.unidad,activo=1`).run(empresa.id,...p);
  const clients=[['30711111118',null,'Distribuidora Norte S.A.','RI','Paraná','3434000000'],[null,'20222222223','Juan Pérez','CF','Concordia','3454000001'],[null,'27333333339','María González','CF','Concordia','3454000002'],[null,'44444444','Carlos López','CF','Concordia','3454000003']];
  for(const c of clients) {
    const existing=db.prepare('SELECT id FROM clientes WHERE empresa_id=? AND ((? IS NOT NULL AND cuit=?) OR (? IS NOT NULL AND dni=?))').get(empresa.id,c[0],c[0],c[1],c[1]);
    if(existing) db.prepare('UPDATE clientes SET razon_social=?,condicion_iva=?,domicilio=?,telefono=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(c[2],c[3],c[4],c[5],existing.id);
    else db.prepare('INSERT INTO clientes(empresa_id,cuit,dni,razon_social,condicion_iva,domicilio,telefono,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(empresa.id,...c);
  }
  const vendedor=db.prepare("SELECT id FROM vendedores WHERE empresa_id=? AND nombre='Vendedor Principal'").get(empresa.id);
  if(vendedor) db.prepare('UPDATE vendedores SET telefono=?,email=?,comision_porcentaje=?,activo=1 WHERE id=?').run('3450000000','vendedor@empresa.com',3,vendedor.id);
  else db.prepare("INSERT INTO vendedores(empresa_id,nombre,telefono,email,comision_porcentaje,activo) VALUES (?,'Vendedor Principal','3450000000','vendedor@empresa.com',3,1)").run(empresa.id);
  db.prepare("UPDATE vendedores SET activo=0 WHERE empresa_id=? AND nombre='Vendedor Principal' AND id<>? AND activo=1").run(empresa.id,vendedor?.id||db.prepare("SELECT id FROM vendedores WHERE empresa_id=? AND nombre='Vendedor Principal'").get(empresa.id).id);
  db.prepare("INSERT OR IGNORE INTO empresa_configuraciones(empresa_id,stock_policy,stock_alerts_enabled,stock_alert_dashboard) VALUES (?,'WARN',1,1)").run(empresa.id);
  db.prepare("INSERT OR IGNORE INTO proveedores(empresa_id,nombre,cuit,condicion_iva,domicilio,telefono,email,saldo_inicial,activo) VALUES (?,'Proveedor Demo S.A.','30700000001','RESPONSABLE INSCRIPTO','Concordia','3454000010','proveedor@demo.com',0,1)").run(empresa.id);
  for (const row of [['PES','Peso argentino','$',1,1],['DOL','Dólar estadounidense','US$',1000,0]])
    db.prepare('INSERT OR IGNORE INTO monedas(empresa_id,codigo,nombre,simbolo,cotizacion,principal,activo) VALUES(?,?,?,?,?,?,1)').run(empresa.id,...row);
  for (const name of ['MERCADERÍAS','SERVICIOS','IMPUESTOS','OTROS']) db.prepare('INSERT OR IGNORE INTO rubros_gasto(empresa_id,nombre) VALUES(?,?)').run(empresa.id,name);
  for (const row of [['CONTADO',0],['CUENTA CORRIENTE',30],['TRANSFERENCIA',0],['CHEQUE',0]]) db.prepare('INSERT OR IGNORE INTO condiciones_pago(empresa_id,nombre,dias) VALUES(?,?,?)').run(empresa.id,...row);
  for (const row of [['PERCEPCIÓN IVA','PERCEPCION'],['PERCEPCIÓN IIBB','PERCEPCION'],['RETENCIÓN IVA','RETENCION'],['RETENCIÓN IIBB','RETENCION']]) db.prepare('INSERT OR IGNORE INTO tipos_impuesto_compra(empresa_id,nombre,naturaleza) VALUES(?,?,?)').run(empresa.id,...row);
  const dep=db.prepare("SELECT id FROM depositos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
  if(!db.prepare("SELECT id FROM sucursales WHERE empresa_id=? AND codigo='CASA'").get(empresa.id)) db.prepare("INSERT INTO sucursales(empresa_id,codigo,nombre,domicilio,deposito_id,activo) VALUES (?,'CASA','Casa Central','Concordia, Entre Ríos',?,1)").run(empresa.id,dep?.id||null);
  if(!db.prepare("SELECT id FROM cajeros WHERE empresa_id=? AND codigo='CAJA1'").get(empresa.id)) db.prepare("INSERT INTO cajeros(empresa_id,codigo,nombre,usuario_id,activo) VALUES (?,'CAJA1','Caja Principal',?,1)").run(empresa.id,user.id);
  const suc=db.prepare("SELECT id FROM sucursales WHERE empresa_id=? AND codigo='CASA'").get(empresa.id);
  if(!db.prepare("SELECT id FROM puntos_venta WHERE empresa_id=? AND numero=1").get(empresa.id)) db.prepare("INSERT INTO puntos_venta(empresa_id,sucursal_id,numero,nombre,fiscal,activo) VALUES (?,?,1,'Punto de venta 0001',1,1)").run(empresa.id,suc?.id||null);
  const insStock=db.prepare('INSERT INTO stock_productos(empresa_id,deposito_id,producto_id,cantidad,stock_minimo,updated_at) VALUES(?,?,?,100,10,CURRENT_TIMESTAMP)');
  const tieneStock=db.prepare('SELECT id FROM stock_productos WHERE empresa_id=? AND deposito_id=? AND producto_id=?');
  for(const p of db.prepare('SELECT id FROM productos WHERE empresa_id=?').all(empresa.id)){if(!tieneStock.get(empresa.id,dep.id,p.id))insStock.run(empresa.id,dep.id,p.id)}
  asegurarSuperadmin(true);
  if(!db.prepare("SELECT id FROM licencias WHERE empresa_id=?").get(empresa.id)) db.prepare("INSERT INTO licencias(empresa_id,plan,precio,descuento_porc,total,fecha_inicio,fecha_vencimiento,estado,notas) VALUES (?,'DEFINITIVO',0,0,0,date('now'),NULL,'ACTIVA','Licencia inicial de demostración')").run(empresa.id);
  return {empresaId:empresa.id,usuario:'admin@empresa.com',clave:'admin123',superadmin:'superadmin'};
}
module.exports=seedDemo;
if(require.main===module) console.log('[DB] Demo cargada:',seedDemo());
