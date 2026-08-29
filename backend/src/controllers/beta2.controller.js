const db = require('../db/database');
const { getEmpresaById } = require('../repositories/empresa.repository');
const TicketDocumentEngine = require('../documents/engine/ticketDocumentEngine');

const companyId = req => Number(req.empresa?.id || req.user?.empresaId || 1);
const userId = req => Number(req.user?.id || req.user?.userId || 1);
const yes = value => value === true || value === 1 || value === '1';
const json = value => { try { return JSON.parse(value || 'null'); } catch { return null; } };

const resourceReaders = {
  afip_suppliers_v30: e => db.prepare(`SELECT id,nombre,cuit,condicion_iva condicionIVA,domicilio,telefono,email,saldo_inicial saldo,activo FROM proveedores WHERE empresa_id=? AND activo=1 ORDER BY nombre`).all(e),
  afip_currencies_v34: e => db.prepare(`SELECT id,codigo,nombre,simbolo,cotizacion,principal,activo FROM monedas WHERE empresa_id=? AND activo=1 ORDER BY principal DESC,nombre`).all(e).map(x=>({...x,principal:!!x.principal,activo:!!x.activo})),
  afip_expense_categories_v40: e => db.prepare(`SELECT id,nombre,activo FROM rubros_gasto WHERE empresa_id=? AND activo=1 ORDER BY nombre`).all(e),
  afip_payment_terms_v41: e => db.prepare(`SELECT id,nombre,dias,activo FROM condiciones_pago WHERE empresa_id=? AND activo=1 ORDER BY nombre`).all(e),
  afip_purchase_tax_kinds_v41: e => db.prepare(`SELECT id,nombre,naturaleza,activo FROM tipos_impuesto_compra WHERE empresa_id=? AND activo=1 ORDER BY naturaleza,nombre`).all(e),
  afip_sellers_v31: e => db.prepare(`SELECT id,nombre,telefono,email,comision_porcentaje comision,activo FROM vendedores WHERE empresa_id=? ORDER BY activo DESC,nombre`).all(e).map(x=>({...x,activo:!!x.activo})),
  afip_branches_v32: e => db.prepare(`SELECT id,codigo,nombre,domicilio,deposito_id depositoId,activo FROM sucursales WHERE empresa_id=? ORDER BY activo DESC,nombre`).all(e).map(x=>({...x,activo:!!x.activo})),
  afip_cashiers_v32: e => db.prepare(`SELECT id,codigo,nombre,usuario_id usuarioId,activo FROM cajeros WHERE empresa_id=? ORDER BY activo DESC,nombre`).all(e).map(x=>({...x,activo:!!x.activo})),
  afip_point_sales_v35: e => db.prepare(`SELECT id,printf('%04d',numero) numero,nombre,sucursal_id sucursalId,fiscal arcaHabilitado,formato_impresion formatoImpresion,activo FROM puntos_venta WHERE empresa_id=? ORDER BY activo DESC,numero`).all(e).map(x=>({...x,arcaHabilitado:!!x.arcaHabilitado,activo:!!x.activo})),
  afip_banks_v32: e => db.prepare(`SELECT b.id,b.nombre,b.titular,b.cuenta,b.cbu,b.alias,b.saldo_inicial saldo_inicial,b.activo,(b.saldo_inicial+COALESCE((SELECT SUM(CASE WHEN m.tipo='CREDITO' THEN m.importe ELSE -m.importe END) FROM banco_movimientos m WHERE m.banco_id=b.id),0)+COALESCE((SELECT SUM(t.total) FROM cheque_depositos t WHERE t.banco_id=b.id AND t.estado='PENDIENTE_CONCILIACION'),0)) saldo FROM bancos b WHERE b.empresa_id=? ORDER BY b.activo DESC,b.nombre`).all(e).map(x=>({...x,activo:!!x.activo})),
  afip_checks_v30: e => db.prepare(`SELECT c.id,c.numero,c.banco_origen banco,c.librador,c.importe,c.fecha_vencimiento vencimiento,c.estado,c.banco_destino_id bancoDepositoId,c.fecha_deposito,cl.razon_social cliente_nombre,pv.nombre proveedor_nombre,op.numero orden_pago_numero,d.fecha fecha_deposito_registro,db.nombre deposito_banco FROM cheques c LEFT JOIN clientes cl ON cl.id=c.cliente_id LEFT JOIN proveedores pv ON pv.id=c.proveedor_id LEFT JOIN ordenes_pago op ON op.id=c.comprobante_id AND c.comprobante_tipo='ORDEN_PAGO' LEFT JOIN cheque_deposito_items di ON di.cheque_id=c.id LEFT JOIN cheque_depositos d ON d.id=di.deposito_id LEFT JOIN bancos db ON db.id=d.banco_id WHERE c.empresa_id=? ORDER BY c.id DESC`).all(e),
  afip_discount_rules_v35: e => db.prepare(`SELECT id,nombre,producto_codigo productCode,cantidad_minima minQty,porcentaje percent,activo FROM descuentos_cantidad WHERE empresa_id=? ORDER BY id DESC`).all(e).map(x=>({...x,activo:!!x.activo})),
  afip_gift_promotions_v35: e => db.prepare(`SELECT id,nombre,disparador_tipo triggerType,disparador_codigo triggerCode,cantidad_minima minQty,importe_minimo minAmount,regalo_codigo giftCode,regalo_descripcion giftDescription,regalo_cantidad giftQty,activo FROM promociones_regalo WHERE empresa_id=? ORDER BY id DESC`).all(e).map(x=>({...x,activo:!!x.activo})),
  afip_combo_rules_v35: e => db.prepare(`SELECT c.id,c.nombre,c.precio comboPrice,c.activo,GROUP_CONCAT(i.producto_codigo||':'||i.cantidad) items FROM combos c LEFT JOIN combo_items i ON i.combo_id=c.id WHERE c.empresa_id=? GROUP BY c.id ORDER BY c.id DESC`).all(e).map(x=>({...x,activo:!!x.activo,items:x.items||''})),
  afip_bank_moves_v32: e => db.prepare(`SELECT id,banco_id bancoId,fecha,concepto,tipo,importe,conciliado,origen_tipo,origen_id FROM banco_movimientos WHERE empresa_id=? ORDER BY fecha DESC,id DESC`).all(e).map(x=>({...x,conciliado:!!x.conciliado})),
  afip_check_deposits_v35: e => db.prepare(`SELECT d.id,d.banco_id bancoId,d.fecha fechaDeposito,d.estado,d.total importe,GROUP_CONCAT(i.cheque_id) chequeIds FROM cheque_depositos d LEFT JOIN cheque_deposito_items i ON i.deposito_id=d.id WHERE d.empresa_id=? GROUP BY d.id ORDER BY d.id DESC`).all(e).map(x=>({...x,chequeIds:String(x.chequeIds||'').split(',').filter(Boolean)})),
  afip_payment_orders_v35: e => db.prepare(`SELECT o.id,'OP-'||printf('%08d',o.numero) numero,o.fecha,o.proveedor_id proveedorId,o.concepto,o.efectivo,o.transferencia,o.total,o.estado,GROUP_CONCAT(oc.cheque_id) chequeIds FROM ordenes_pago o LEFT JOIN orden_pago_cheques oc ON oc.orden_pago_id=o.id WHERE o.empresa_id=? GROUP BY o.id ORDER BY o.id DESC`).all(e).map(x=>({...x,chequeIds:String(x.chequeIds||'').split(',').filter(Boolean)})),
  afip_company_v31: e => {
    const row=db.prepare(`SELECT e.*,c.* FROM empresas e LEFT JOIN empresa_configuraciones c ON c.empresa_id=e.id WHERE e.id=?`).get(e)||{};
    const profile=json(row.company_profile_json)||{};
    return {...profile,razonSocial:row.razon_social||row.nombre, cuit:row.cuit||'', domicilio:row.direccion||'',telefono:row.telefono||'',email:row.email||'',condicionIVA:row.condicion_iva||'RI',logoUrl:row.logo_url||profile.logoUrl||'',usaSucursalAlIniciar:!!row.require_branch_on_start,sucursalPredeterminadaId:row.default_branch_id||'',puntoVentaPredeterminadoId:row.default_pos_id||'',arcaAmbiente:row.arca_environment||'HOMOLOGACION'};
  },
  afip_designer_v40: e => json(db.prepare(`SELECT configuracion_json FROM comprobante_plantillas WHERE empresa_id=? AND tipo='GENERAL'`).get(e)?.configuracion_json)||null,
  afip_stock_transfers_v35: e => db.prepare(`SELECT t.id,t.fecha,t.origen_id origenId,t.destino_id destinoId,t.motivo,t.estado FROM transferencias_stock t WHERE t.empresa_id=? ORDER BY t.id DESC`).all(e).map(t => ({...t, items: db.prepare('SELECT i.producto_id productId,i.cantidad FROM transferencia_stock_items i WHERE i.transferencia_id=?').all(t.id)})),
  afip_raffle_rules_v35: e => db.prepare('SELECT id,nombre,min_amount minAmount,coupons,fecha_sorteo fechaSorteo,premio,activo FROM reglas_sorteo WHERE empresa_id=? ORDER BY id').all(e).map(r=>({...r,activo:!!r.activo}))
};

function readResource(req,res){
  const fn=resourceReaders[req.params.key];
  if(!fn)return res.status(404).json({ok:false,error:'El recurso no está normalizado.'});
  res.json({ok:true,key:req.params.key,value:fn(companyId(req))});
}

function syncRows(table,e,rows,columns,map){
  const keep=[];
  for(const row of rows){
    const values=map(row); const id=Number(row.id)||null;
    if(id){
      const sets=columns.map(x=>`${x}=?`).join(',');
      const result=db.prepare(`UPDATE ${table} SET ${sets} WHERE id=? AND empresa_id=?`).run(...values,id,e);
      if(result.changes) keep.push(id); else { const info=db.prepare(`INSERT INTO ${table}(empresa_id,${columns.join(',')}) VALUES(?,${columns.map(()=>'?').join(',')})`).run(e,...values);keep.push(Number(info.lastInsertRowid)); }
    } else { const info=db.prepare(`INSERT INTO ${table}(empresa_id,${columns.join(',')}) VALUES(?,${columns.map(()=>'?').join(',')})`).run(e,...values);keep.push(Number(info.lastInsertRowid)); }
  }
  if(['proveedores','monedas','rubros_gasto','condiciones_pago','tipos_impuesto_compra','vendedores','sucursales','cajeros','puntos_venta','bancos'].includes(table)){
    if(keep.length) db.prepare(`UPDATE ${table} SET activo=0 WHERE empresa_id=? AND id NOT IN (${keep.map(()=>'?').join(',')})`).run(e,...keep);
  }
}

function writeResource(req,res){
  const e=companyId(req),key=req.params.key,value=req.body?.value;
  const rows=Array.isArray(value)?value:[];
  const tx=db.transaction(()=>{
    if(key==='afip_suppliers_v30') syncRows('proveedores',e,rows,['nombre','cuit','condicion_iva','domicilio','telefono','email','saldo_inicial','activo'],r=>[r.nombre||r.razonSocial,String(r.cuit||'')||null,r.condicionIVA||'',r.domicilio||'',r.telefono||'',r.email||'',Number(r.saldo||0),yes(r.activo??true)?1:0]);
    else if(key==='afip_currencies_v34') syncRows('monedas',e,rows,['codigo','nombre','simbolo','cotizacion','principal','activo'],r=>[String(r.codigo||'').toUpperCase(),r.nombre,r.simbolo||'',Number(r.cotizacion||1),yes(r.principal)?1:0,yes(r.activo??true)?1:0]);
    else if(key==='afip_expense_categories_v40') syncRows('rubros_gasto',e,rows,['nombre','activo'],r=>[r.nombre,yes(r.activo??true)?1:0]);
    else if(key==='afip_payment_terms_v41') syncRows('condiciones_pago',e,rows,['nombre','dias','activo'],r=>[r.nombre,Number(r.dias||0),yes(r.activo??true)?1:0]);
    else if(key==='afip_purchase_tax_kinds_v41') syncRows('tipos_impuesto_compra',e,rows,['nombre','naturaleza','activo'],r=>[r.nombre,String(r.naturaleza||'PERCEPCION').toUpperCase(),yes(r.activo??true)?1:0]);
    else if(key==='afip_sellers_v31') syncRows('vendedores',e,rows,['nombre','telefono','email','comision_porcentaje','activo'],r=>[r.nombre,r.telefono||'',r.email||'',Number(r.comision||0),yes(r.activo??true)?1:0]);
    else if(key==='afip_branches_v32') syncRows('sucursales',e,rows,['codigo','nombre','domicilio','deposito_id','activo'],r=>[r.codigo||`S${Date.now()}`,r.nombre,r.domicilio||'',r.depositoId||null,yes(r.activo??true)?1:0]);
    else if(key==='afip_cashiers_v32') syncRows('cajeros',e,rows,['codigo','nombre','usuario_id','activo'],r=>[r.codigo||`C${Date.now()}`,r.nombre,r.usuarioId||null,yes(r.activo??true)?1:0]);
    else if(key==='afip_point_sales_v35') syncRows('puntos_venta',e,rows,['numero','nombre','sucursal_id','fiscal','formato_impresion','activo'],r=>[Number(r.numero),r.nombre,r.sucursalId||null,yes(r.arcaHabilitado)?1:0,r.formatoImpresion||'A4',yes(r.activo??true)?1:0]);
    else if(key==='afip_banks_v32') syncRows('bancos',e,rows,['nombre','titular','cuenta','cbu','alias','saldo_inicial','activo'],r=>[r.nombre,r.titular||'',r.cuenta||'',r.cbu||'',r.alias||'',Number(r.saldo||0),yes(r.activo??true)?1:0]);
    else if(key==='afip_checks_v30') syncChecks(e,rows);
    else if(key==='afip_discount_rules_v35') replaceRules('descuentos_cantidad',e,rows,r=>[r.nombre,r.productCode||'',Number(r.minQty||0),Number(r.percent||0),yes(r.activo??true)?1:0],['nombre','producto_codigo','cantidad_minima','porcentaje','activo']);
    else if(key==='afip_gift_promotions_v35') replaceRules('promociones_regalo',e,rows,r=>[r.nombre,r.triggerType||'PRODUCT',r.triggerCode||'',Number(r.minQty||0),Number(r.minAmount||0),r.giftCode||'',r.giftDescription||'',Number(r.giftQty||1),yes(r.activo??true)?1:0],['nombre','disparador_tipo','disparador_codigo','cantidad_minima','importe_minimo','regalo_codigo','regalo_descripcion','regalo_cantidad','activo']);
    else if(key==='afip_combo_rules_v35') syncCombos(e,rows);
    else if(key==='afip_bank_moves_v32') syncBankMoves(e,rows);
    else if(key==='afip_company_v31') saveCompany(e,value||{});
    else if(key==='afip_designer_v40') db.prepare(`INSERT INTO comprobante_plantillas(empresa_id,tipo,configuracion_json) VALUES(?,'GENERAL',?) ON CONFLICT(empresa_id,tipo) DO UPDATE SET configuracion_json=excluded.configuracion_json,updated_at=CURRENT_TIMESTAMP`).run(e,JSON.stringify(value||{}));
    else if(key==='afip_stock_transfers_v35') syncTransfers(e,rows);
    else if(key==='afip_raffle_rules_v35') replaceRules('reglas_sorteo',e,rows,r=>[r.nombre,Number(r.minAmount||0),Number(r.coupons||1),r.fechaSorteo||null,r.premio||'',yes(r.activo??true)?1:0],['nombre','min_amount','coupons','fecha_sorteo','premio','activo']);
    else throw Object.assign(new Error('El recurso no está normalizado.'),{status:404});
  });
  tx(); res.json({ok:true,key,value:resourceReaders[key](e)});
}

function replaceRules(table,e,rows,map,columns){ db.prepare(`DELETE FROM ${table} WHERE empresa_id=?`).run(e); const q=db.prepare(`INSERT INTO ${table}(empresa_id,${columns.join(',')}) VALUES(?,${columns.map(()=>'?').join(',')})`); rows.forEach(r=>q.run(e,...map(r))); }
function syncChecks(e,rows){ const upd=db.prepare(`UPDATE cheques SET numero=?,banco_origen=?,librador=?,importe=?,fecha_vencimiento=?,estado=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?`); const ins=db.prepare(`INSERT INTO cheques(empresa_id,numero,banco_origen,librador,importe,fecha_vencimiento,estado) VALUES(?,?,?,?,?,?,?)`); for(const r of rows){ const id=Number(r.id)||null; const values=[r.numero,r.banco||r.banco_origen||'',r.librador||'',Number(r.importe),r.vencimiento||r.fecha_vencimiento||null,r.estado||'EN_CARTERA']; if(id){ const result=upd.run(...values,id,e); if(!result.changes)ins.run(e,...values); } else ins.run(e,...values); } }
function syncCombos(e,rows){ db.prepare('DELETE FROM combo_items WHERE combo_id IN (SELECT id FROM combos WHERE empresa_id=?)').run(e);db.prepare('DELETE FROM combos WHERE empresa_id=?').run(e);for(const r of rows){const c=db.prepare('INSERT INTO combos(empresa_id,nombre,precio,activo) VALUES(?,?,?,?)').run(e,r.nombre,Number(r.comboPrice||0),yes(r.activo??true)?1:0);const ins=db.prepare('INSERT INTO combo_items(combo_id,producto_codigo,cantidad) VALUES(?,?,?)');String(r.items||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(part=>{const [code,qty]=part.split(':');if(code&&Number(qty)>0)ins.run(c.lastInsertRowid,code.trim(),Number(qty));});}}
function syncBankMoves(e,rows){db.prepare('DELETE FROM banco_movimientos WHERE empresa_id=? AND origen_tipo IS NULL').run(e);const ins=db.prepare('INSERT INTO banco_movimientos(empresa_id,banco_id,fecha,tipo,concepto,importe,conciliado,fecha_conciliacion) VALUES(?,?,?,?,?,?,?,?)');rows.filter(r=>!r.origen_tipo).forEach(r=>ins.run(e,Number(r.bancoId),r.fecha,String(r.tipo||'CREDITO').replace('É','E'),r.concepto,Number(r.importe),yes(r.conciliado)?1:0,yes(r.conciliado)?new Date().toISOString():null));}
function syncTransfers(e,rows){
  const insT=db.prepare('INSERT INTO transferencias_stock(empresa_id,fecha,origen_id,destino_id,motivo,estado) VALUES(?,?,?,?,?,?)');
  const insI=db.prepare('INSERT INTO transferencia_stock_items(transferencia_id,producto_id,cantidad) VALUES(?,?,?)');
  for(const r of rows){
    if(String(r.estado||'CONFIRMADA').toUpperCase()!=='CONFIRMADA')continue;
    const origen=Number(r.origenId||r.origen_id),destino=Number(r.destinoId||r.destino_id);
    if(!origen||!destino||origen===destino)throw Object.assign(new Error('Origen y destino de la transferencia son obligatorios y distintos.'),{status:400});
    const items=(Array.isArray(r.items)?r.items:[]).filter(i=>Number(i.productId||i.producto_id)&&Number(i.cantidad)>0);
    if(!items.length)throw Object.assign(new Error('La transferencia debe tener al menos un producto.'),{status:400});
    const depOrigen=db.prepare('SELECT deposito_id FROM sucursales WHERE id=? AND empresa_id=?').get(origen,e)?.deposito_id||origen;
    const depDestino=db.prepare('SELECT deposito_id FROM sucursales WHERE id=? AND empresa_id=?').get(destino,e)?.deposito_id||destino;
    for(const i of items){
      const prodId=Number(i.productId||i.producto_id),cant=Number(i.cantidad);
      const disp=db.prepare('SELECT cantidad FROM stock_productos WHERE empresa_id=? AND deposito_id=? AND producto_id=?').get(e,depOrigen,prodId)?.cantidad||0;
      if(disp+0.0001<cant)throw Object.assign(new Error('Stock insuficiente en el origen para el producto #'+prodId+' (disponible '+disp+', pedido '+cant+').'),{status:409});
    }
    const info=insT.run(e,String(r.fecha||new Date().toISOString().slice(0,10)),origen,destino,String(r.motivo||'Transferencia interna'),'CONFIRMADA');
    for(const i of items){
      const prodId=Number(i.productId||i.producto_id),cant=Number(i.cantidad);
      insI.run(info.lastInsertRowid,prodId,cant);
      db.prepare('INSERT OR IGNORE INTO stock_productos(empresa_id,deposito_id,producto_id,cantidad,stock_minimo,updated_at) VALUES(?,?,?,0,0,CURRENT_TIMESTAMP)').run(e,depDestino,prodId);
      db.prepare('UPDATE stock_productos SET cantidad=cantidad-?,updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND deposito_id=? AND producto_id=?').run(cant,e,depOrigen,prodId);
      db.prepare('UPDATE stock_productos SET cantidad=cantidad+?,updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND deposito_id=? AND producto_id=?').run(cant,e,depDestino,prodId);
      db.prepare('INSERT INTO stock_movimientos(empresa_id,deposito_id,producto_id,tipo,cantidad,motivo,usuario_id) VALUES(?,?,?,?,?,?,?)').run(e,depOrigen,prodId,'SALIDA_TRANSFERENCIA',-cant,`Transferencia #${info.lastInsertRowid}`,null);
      db.prepare('INSERT INTO stock_movimientos(empresa_id,deposito_id,producto_id,tipo,cantidad,motivo,usuario_id) VALUES(?,?,?,?,?,?,?)').run(e,depDestino,prodId,'ENTRADA_TRANSFERENCIA',cant,`Transferencia #${info.lastInsertRowid}`,null);
    }
  }
}
function saveCompany(e,d){db.prepare(`UPDATE empresas SET razon_social=?,cuit=?,direccion=?,telefono=?,email=?,condicion_iva=? WHERE id=?`).run(d.razonSocial||'',d.cuit||'',d.domicilio||'',d.telefono||'',d.email||'',d.condicionIVA||'RI',e);db.prepare(`INSERT INTO empresa_configuraciones(empresa_id,logo_url,require_branch_on_start,default_branch_id,default_pos_id,arca_environment,company_profile_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(empresa_id) DO UPDATE SET logo_url=excluded.logo_url,require_branch_on_start=excluded.require_branch_on_start,default_branch_id=excluded.default_branch_id,default_pos_id=excluded.default_pos_id,arca_environment=excluded.arca_environment,company_profile_json=excluded.company_profile_json,updated_at=CURRENT_TIMESTAMP`).run(e,d.logoUrl||'',yes(d.usaSucursalAlIniciar)?1:0,d.sucursalPredeterminadaId||null,d.puntoVentaPredeterminadoId||null,d.arcaAmbiente||'HOMOLOGACION',JSON.stringify(d));}

function listDeposits(req,res){res.json({ok:true,deposits:resourceReaders.afip_check_deposits_v35(companyId(req))});}
function reconcileDeposit(req,res){const e=companyId(req),id=Number(req.params.id);const tx=db.transaction(()=>{const d=db.prepare(`SELECT * FROM cheque_depositos WHERE id=? AND empresa_id=? AND estado='PENDIENTE_CONCILIACION'`).get(id,e);if(!d)throw Object.assign(new Error('El depósito no está pendiente.'),{status:409});db.prepare(`UPDATE cheque_depositos SET estado='CONCILIADO' WHERE id=?`).run(id);db.prepare(`UPDATE cheques SET estado='COBRADO',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT cheque_id FROM cheque_deposito_items WHERE deposito_id=?)`).run(id);db.prepare(`INSERT INTO banco_movimientos(empresa_id,banco_id,fecha,tipo,concepto,importe,origen_tipo,origen_id,conciliado,fecha_conciliacion) VALUES(?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP)`).run(e,d.banco_id,d.fecha,'CREDITO',`DEPÓSITO DE CHEQUES #${id}`,d.total,'DEPOSITO_CHEQUES',id);});tx();res.json({ok:true});}
function listPaymentOrders(req,res){res.json({ok:true,orders:resourceReaders.afip_payment_orders_v35(companyId(req))});}
function createPaymentOrder(req,res){const e=companyId(req),d=req.body,ids=(d.chequeIds||d.cheque_ids||[]).map(Number).filter(Boolean);const tx=db.transaction(()=>{if(!d.proveedorId&&!d.proveedor_id)throw Object.assign(new Error('El proveedor es obligatorio.'),{status:400});const checks=ids.length?db.prepare(`SELECT * FROM cheques WHERE empresa_id=? AND id IN (${ids.map(()=>'?').join(',')}) AND estado='EN_CARTERA'`).all(e,...ids):[];if(checks.length!==ids.length)throw Object.assign(new Error('Uno o más cheques ya no están disponibles.'),{status:409});const chequeTotal=checks.reduce((n,x)=>n+Number(x.importe),0),cash=Number(d.efectivo||0),transfer=Number(d.transferencia||0),total=cash+transfer+chequeTotal;const next=Number(db.prepare('SELECT COALESCE(MAX(numero),0)+1 n FROM ordenes_pago WHERE empresa_id=?').get(e).n);let movementId=null;if(cash>0){const s=db.prepare("SELECT * FROM caja_sesiones WHERE empresa_id=? AND estado='ABIERTA' ORDER BY id DESC LIMIT 1").get(e);if(!s)throw Object.assign(new Error('Debe existir una caja abierta para pagar en efectivo.'),{status:409});const m=db.prepare(`INSERT INTO caja_movimientos(empresa_id,tipo,concepto,importe,medios_json,caja_sesion_id,sucursal_id,cajero_id) VALUES(?,?,?,?,?,?,?,?)`).run(e,'EGRESO',`ORDEN DE PAGO OP-${String(next).padStart(8,'0')}`,-cash,JSON.stringify({EFECTIVO:cash}),s.id,s.sucursal_id,s.cajero_id);movementId=m.lastInsertRowid;db.prepare('UPDATE caja_sesiones SET saldo_teorico=saldo_teorico-? WHERE id=?').run(cash,s.id);}const op=db.prepare(`INSERT INTO ordenes_pago(empresa_id,proveedor_id,numero,fecha,concepto,efectivo,transferencia,total,caja_movimiento_id) VALUES(?,?,?,?,?,?,?,?,?)`).run(e,Number(d.proveedorId||d.proveedor_id),next,d.fecha||new Date().toISOString().slice(0,10),d.concepto||'',cash,transfer,total,movementId);const ins=db.prepare('INSERT INTO orden_pago_cheques(orden_pago_id,cheque_id,importe) VALUES(?,?,?)');for(const c of checks){ins.run(op.lastInsertRowid,c.id,c.importe);db.prepare("UPDATE cheques SET estado='ENTREGADO',proveedor_id=?,comprobante_tipo='ORDEN_PAGO',comprobante_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(Number(d.proveedorId||d.proveedor_id),op.lastInsertRowid,c.id);}return op.lastInsertRowid;});const id=tx();res.status(201).json({ok:true,order:resourceReaders.afip_payment_orders_v35(e).find(x=>x.id===id)});}
function closeCash(req,res){const e=companyId(req),id=Number(req.params.id),d=req.body||{};const tx=db.transaction(()=>{const s=db.prepare("SELECT * FROM caja_sesiones WHERE id=? AND empresa_id=? AND estado='ABIERTA'").get(id,e);if(!s)throw Object.assign(new Error('La caja no existe o ya está cerrada.'),{status:404});const counted=Number(d.importe_contado??d.importeContado??s.saldo_teorico);db.prepare(`UPDATE caja_sesiones SET estado='CERRADA',fecha_cierre=CURRENT_TIMESTAMP,importe_contado=?,diferencia=?-saldo_teorico,arqueo_json=?,observaciones_cierre=? WHERE id=?`).run(counted,counted,JSON.stringify(d.arqueo||{}),d.observaciones||'',id);return db.prepare('SELECT * FROM caja_sesiones WHERE id=?').get(id);});res.json({ok:true,session:tx()});}

function openCash(req,res){const e=companyId(req),d=req.body||{},cashier=Number(d.cajero_id),branch=Number(d.sucursal_id);if(!cashier||!branch)return res.status(400).json({ok:false,error:'Sucursal y cajero son obligatorios.'});const pv=Number(d.punto_venta)||null;if(pv!==null&&!db.prepare('SELECT id FROM puntos_venta WHERE empresa_id=? AND numero=? AND activo=1').get(e,pv))return res.status(400).json({ok:false,error:'El punto de venta no existe o está inactivo.'});const current=db.prepare("SELECT id FROM caja_sesiones WHERE empresa_id=? AND cajero_id=? AND sucursal_id=? AND estado='ABIERTA' AND COALESCE(punto_venta,0)=COALESCE(?,0)").get(e,cashier,branch,pv);if(current)return res.status(409).json({ok:false,error:'Ese cajero ya tiene una caja abierta en ese punto de venta.'});const amount=Number(d.importe_apertura||0);const info=db.prepare('INSERT INTO caja_sesiones(empresa_id,sucursal_id,cajero_id,usuario_id,importe_apertura,saldo_teorico,punto_venta) VALUES(?,?,?,?,?,?,?)').run(e,branch,cashier,userId(req),amount,amount,pv);if(amount)db.prepare(`INSERT INTO caja_movimientos(empresa_id,tipo,concepto,importe,medios_json,caja_sesion_id,sucursal_id,cajero_id) VALUES(?,?,?,?,?,?,?,?)`).run(e,'APERTURA','FONDO INICIAL',amount,JSON.stringify({EFECTIVO:amount}),info.lastInsertRowid,branch,cashier);res.status(201).json({ok:true,session:db.prepare('SELECT * FROM caja_sesiones WHERE id=?').get(info.lastInsertRowid)});}
function cashMovement(req,res){const e=companyId(req),d=req.body||{},id=Number(d.caja_sesion_id),amount=Math.abs(Number(d.importe||0)),type=String(d.tipo||'INGRESO').toUpperCase();if(!id||!amount||!['INGRESO','EGRESO'].includes(type))return res.status(400).json({ok:false,error:'Caja, tipo e importe son obligatorios.'});const tx=db.transaction(()=>{const s=db.prepare("SELECT * FROM caja_sesiones WHERE id=? AND empresa_id=? AND estado='ABIERTA'").get(id,e);if(!s)throw Object.assign(new Error('La caja no está abierta.'),{status:409});const signed=type==='EGRESO'?-amount:amount;db.prepare(`INSERT INTO caja_movimientos(empresa_id,tipo,concepto,importe,medios_json,caja_sesion_id,sucursal_id,cajero_id) VALUES(?,?,?,?,?,?,?,?)`).run(e,type,d.concepto||type,signed,JSON.stringify({[d.medio||'EFECTIVO']:amount}),id,s.sucursal_id,s.cajero_id);db.prepare('UPDATE caja_sesiones SET saldo_teorico=saldo_teorico+? WHERE id=?').run(signed,id);});tx();res.status(201).json({ok:true});}

function getDrafts(req,res){const row=db.prepare('SELECT datos_json,updated_at FROM pos_borradores WHERE empresa_id=? AND usuario_id=?').get(companyId(req),userId(req));res.json({ok:true,draft:row?json(row.datos_json):null,updatedAt:row?.updated_at||null});}
function saveDrafts(req,res){const value=req.body?.draft||req.body||{};db.prepare(`INSERT INTO pos_borradores(empresa_id,usuario_id,datos_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(empresa_id,usuario_id) DO UPDATE SET datos_json=excluded.datos_json,updated_at=CURRENT_TIMESTAMP`).run(companyId(req),userId(req),JSON.stringify(value));res.json({ok:true,draft:value});}
function deleteDrafts(req,res){db.prepare('DELETE FROM pos_borradores WHERE empresa_id=? AND usuario_id=?').run(companyId(req),userId(req));res.json({ok:true});}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function printPosOperation(req,res){const e=companyId(req),id=Number(req.params.id);const sale=db.prepare(`SELECT v.*,c.razon_social cliente,c.cuit,c.dni,p.formato_impresion,p.nombre punto_nombre,e.razon_social empresa,e.cuit empresa_cuit,e.direccion empresa_direccion FROM ventas_pos v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN puntos_venta p ON p.empresa_id=v.empresa_id AND p.numero=v.punto_venta JOIN empresas e ON e.id=v.empresa_id WHERE v.id=? AND v.empresa_id=?`).get(id,e);if(!sale)return res.status(404).send('Operación no encontrada.');const items=db.prepare('SELECT * FROM venta_pos_items WHERE venta_id=? ORDER BY id').all(id),ticket=String(sale.formato_impresion||'A4').toUpperCase()==='80MM';const rows=items.map(x=>`<tr><td>${escapeHtml(x.cantidad)}</td><td>${escapeHtml(x.descripcion)}</td><td>$ ${Number(x.precio_unitario).toLocaleString('es-AR',{minimumFractionDigits:2})}</td><td>$ ${Number(x.subtotal).toLocaleString('es-AR',{minimumFractionDigits:2})}</td></tr>`).join('');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sale.tipo)} ${sale.punto_venta}-${sale.numero}</title><style>@page{size:${ticket?'80mm auto':'A4'};margin:${ticket?'4mm':'12mm'}}body{font-family:Arial,sans-serif;margin:0;color:#111;font-size:${ticket?'11px':'13px'}}main{max-width:${ticket?'72mm':'190mm'};margin:auto}.center{text-align:center}.head{border-bottom:2px solid #111;padding-bottom:8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}table{width:100%;border-collapse:collapse}th,td{padding:6px 3px;border-bottom:1px solid #bbb;text-align:left}th:nth-last-child(-n+2),td:nth-last-child(-n+2){text-align:right}.total{text-align:right;font-size:${ticket?'18px':'24px'};font-weight:bold;margin-top:14px}.actions{margin:20px 0;text-align:center}@media print{.actions{display:none}}</style></head><body><main><div class="head center"><h2>${escapeHtml(sale.empresa||'EMPRESA')}</h2><div>CUIT ${escapeHtml(sale.empresa_cuit)} · ${escapeHtml(sale.empresa_direccion)}</div><h1>${escapeHtml(sale.tipo)}</h1><b>${String(sale.punto_venta).padStart(4,'0')}-${String(sale.numero).padStart(8,'0')}</b></div><div class="meta"><span>Fecha: ${escapeHtml(String(sale.fecha).slice(0,19))}</span><span>Condición: ${escapeHtml(sale.condicion_pago)}</span><span>Cliente: ${escapeHtml(sale.cliente||'CONSUMIDOR FINAL')}</span><span>Documento: ${escapeHtml(sale.cuit||sale.dni||'-')}</span></div><table><thead><tr><th>Cant.</th><th>Producto</th><th>Precio</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="total">TOTAL $ ${Number(sale.total).toLocaleString('es-AR',{minimumFractionDigits:2})}</div><div class="actions"><button onclick="window.print()">Imprimir</button></div></main><script>setTimeout(()=>window.print(),300)</script></body></html>`);}

function printPosOperation(req,res){return printPosOperationV2(req,res);}
async function printPosOperationV2(req,res){
  const e=companyId(req),id=Number(req.params.id);
  const sale=db.prepare(`SELECT v.*,c.razon_social cliente,c.cuit,c.dni,c.condicion_iva cliente_condicion_iva,c.domicilio cliente_domicilio,c.localidad cliente_localidad,c.provincia cliente_provincia,ve.nombre vendedor_nombre,p.formato_impresion,d.cae,d.cae_vencimiento,d.comprobante_tipo_afip,d.subtipo,d.vencimiento documento_vencimiento,d.importe_neto documento_neto,d.importe_iva documento_iva,d.importe_total documento_total,d.importe_bruto documento_bruto,d.descuento_general documento_descuento,d.descuento_importe documento_descuento_importe,d.documento_origen_tipo,d.documento_origen_punto_venta,d.documento_origen_numero
    FROM ventas_pos v
    LEFT JOIN clientes c ON c.id=v.cliente_id
    LEFT JOIN vendedores ve ON ve.id=v.vendedor_id
    LEFT JOIN puntos_venta p ON p.empresa_id=v.empresa_id AND p.numero=v.punto_venta
    LEFT JOIN documentos_comerciales d ON d.id=v.documento_id
    WHERE v.id=? AND v.empresa_id=?`).get(id,e);
  if(!sale)return res.status(404).send('Operación no encontrada.');
  sale.subtipo=sale.subtipo||null;
  sale.condicion_iva=sale.cliente_condicion_iva||null;
  sale.domicilio=sale.cliente_domicilio||null;
  sale.localidad=sale.cliente_localidad||null;
  sale.provincia=sale.cliente_provincia||null;
  sale.vendedor=sale.vendedor_nombre||null;
  sale.fecha_vencimiento=sale.documento_vencimiento||sale.cae_vencimiento||null;
  sale.neto=sale.documento_neto??null;
  sale.ivaImporte=sale.documento_iva??null;
  sale.totalFiscal=sale.documento_total??null;
  sale.importe_bruto=sale.documento_bruto??sale.subtotal??null;
  sale.descuento_general=Number((sale.documento_descuento ?? sale.descuento_general) || 0);
  sale.descuento_importe=Number(sale.documento_descuento_importe||0);
  sale.recargo_general=Number(sale.recargo_general||0);
  const items=db.prepare('SELECT * FROM venta_pos_items WHERE venta_id=? ORDER BY id').all(id);
  const empresa=getEmpresaById(e);
  if(!empresa)return res.status(404).send('No se encontró la empresa.');
  try{
    const html=await TicketDocumentEngine.render({empresa,sale,items});
    res.type('html').send(html);
  }catch(error){
    res.status(500).send(`No se pudo generar el comprobante: ${escapeHtml(error.message)}`);
  }
}

module.exports={readResource,writeResource,listDeposits,reconcileDeposit,listPaymentOrders,createPaymentOrder,closeCash,openCash,cashMovement,getDrafts,saveDrafts,deleteDrafts,printPosOperation:printPosOperationV2,printPosVouchers};

function printPosVouchers(req,res){
  const e=companyId(req),id=Number(req.params.id);
  const sale=db.prepare(`SELECT v.*,p.formato_impresion FROM ventas_pos v LEFT JOIN puntos_venta p ON p.empresa_id=v.empresa_id AND p.numero=v.punto_venta WHERE v.id=? AND v.empresa_id=?`).get(id,e);
  if(!sale)return res.status(404).send('Operación no encontrada.');
  const regalos=db.prepare('SELECT descripcion,cantidad FROM venta_pos_items WHERE venta_id=? AND promocion=1').all(id);
  const cupones=db.prepare(`SELECT cs.numero,rs.nombre,rs.premio,rs.fecha_sorteo FROM cupones_sorteo cs LEFT JOIN reglas_sorteo rs ON rs.id=cs.regla_id WHERE cs.venta_id=? AND cs.estado='ENTREGADO' ORDER BY cs.numero`).all(id);
  if(!regalos.length&&!cupones.length)return res.status(404).send('Esta operación no tiene regalos ni cupones de sorteo.');
  const empresa=db.prepare('SELECT razon_social nombre,cuit FROM empresas WHERE id=?').get(e)||{};
  const ticket=String(sale.formato_impresion||'A4').toUpperCase()==='80MM';
  const esc=(s)=>String(s||'').replace(/[&<>]/g,(x)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[x]));
  const vales=[
    ...regalos.map(r=>`<div class="vale"><h2>VALE DE REGALO</h2><p><strong>${esc(r.cantidad)} x ${esc(r.descripcion)}</strong></p><p>Válido para canjear en esta empresa.</p></div>`),
    ...cupones.map(s=>`<div class="vale"><h2>CUPÓN DE SORTEO N° ${esc(String(s.numero).padStart(5,'0'))}</h2><p>Para el sorteo «${esc(s.premio||s.nombre)}»${s.fecha_sorteo?` (sorteo: ${esc(s.fecha_sorteo)})`:''}</p><p class="nota">Guardá este número: se usará en el sorteo.</p></div>`),
  ];
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Vales</title><style>@page{size:${ticket?'80mm auto':'A4'};margin:${ticket?'4mm':'10mm'}}body{font-family:Arial,sans-serif;margin:0;color:#111;font-size:13px}.center{text-align:center}.head{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}.vale{border:2px dashed #7C5CFC;border-radius:10px;padding:14px;margin:10px 0}.vale h2{margin:0 0 6px;font-size:15px;color:#6952C4}.vale p{margin:2px 0}@media print{.actions{display:none}}</style></head><body><main><div class="head center"><h2>${esc(empresa.nombre||'EMPRESA')}</h2><div>CUIT ${esc(empresa.cuit||'')}</div></div>${vales.join('')}<div class="actions"><button onclick="window.print()">Imprimir</button></div></main><script>setTimeout(()=>window.print(),300)</script></body></html>`);
}
