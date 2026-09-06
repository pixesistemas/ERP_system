const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { nowLocal } = require('../utils/time');
const { registrarMovimientoCC } = require('../repositories/clienteCuentaCorriente.repository');
const { getEmpresaById } = require('../repositories/empresa.repository');
const { getClienteById } = require('../repositories/cliente.repository');
const { emitirComprobanteAfip, FiscalNetworkError } = require('../afip/fiscalEmission.service');
const { getLetraComprobante, getNombreComprobante } = require('../afip/fiscal.constants');
const { registrarComision } = require('../repositories/comision.repository');

function empresaId(req) { return Number(req.empresa?.id || req.user?.empresaId || 1); }
function bool(v) { return v === true || v === 1 || v === '1'; }
function brutoYDescuento(neto, pct) {
  const p = Math.max(0, Number(pct || 0));
  if (p <= 0) return { bruto: Number(neto || 0), descuento: 0 };
  const bruto = Math.round(Number(neto || 0) / (1 - p / 100) * 100) / 100;
  return { bruto, descuento: Math.round((bruto - Number(neto || 0)) * 100) / 100 };
}
function afipEstadoDe(fiscal, pendiente) {
  if (pendiente) return 'PENDIENTE';
  if (fiscal && fiscal.ok) return 'AUTORIZADO';
  return 'SIN_CAE';
}
function afipObservacionesDe(fiscal, pendiente) {
  if (pendiente) return JSON.stringify({ error: pendiente.error || 'ARCA no respondió' });
  if (fiscal && !fiscal.ok) return JSON.stringify(fiscal.errores || fiscal.observaciones || null);
  if (fiscal && fiscal.ok && fiscal.observaciones) return JSON.stringify(fiscal.observaciones);
  return null;
}

/*
 * Emite un comprobante electrónico (factura, NC o ND) contra WSFE/ARCA.
 * Reutiliza FiscalEmissionService: arma el request con invoiceBuilder,
 * resuelve A/B/C, llama a AFIP y registra el intento. No toca la base
 * comercial salvo fiscal_intentos: la operación la persiste el llamador.
 */
async function emitirFacturaAfip({ empresaId: eid, puntoVenta, clienteId, clienteNombre, items, operacion = 'FACTURA', cbteAsoc = null, ventaId = null, documentoId = null }) {
  return emitirComprobanteAfip({
    empresaId: eid,
    puntoVenta,
    clienteId,
    clienteNombre,
    items,
    operacion,
    cbteAsoc,
    ventaId,
    documentoId,
  });
}

function listBanks(req, res) {
  const rows = db.prepare(`SELECT b.*,(b.saldo_inicial+COALESCE((SELECT SUM(CASE WHEN m.tipo='CREDITO' THEN m.importe ELSE -m.importe END) FROM banco_movimientos m WHERE m.banco_id=b.id),0)+COALESCE((SELECT SUM(t.total) FROM cheque_depositos t WHERE t.banco_id=b.id AND t.estado='PENDIENTE_CONCILIACION'),0)) saldo FROM bancos b WHERE b.empresa_id=? AND b.activo=1 ORDER BY b.nombre`).all(empresaId(req));
  res.json({ ok: true, banks: rows });
}
function saveBank(req, res) {
  const e = empresaId(req); const d = req.body;
  if (!d.nombre?.trim()) return res.status(400).json({ ok:false, error:'El nombre del banco es obligatorio.' });
  if (req.params.id) {
    db.prepare(`UPDATE bancos SET nombre=?, cuenta=?, cbu=?, alias=?, saldo_inicial=?, activo=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?`).run(d.nombre.trim(), d.cuenta||'', d.cbu||'', d.alias||'', Number(d.saldo_inicial||0), bool(d.activo ?? true)?1:0, Number(req.params.id), e);
  } else {
    db.prepare(`INSERT INTO bancos(empresa_id,nombre,cuenta,cbu,alias,saldo_inicial,activo) VALUES(?,?,?,?,?,?,?)`).run(e,d.nombre.trim(),d.cuenta||'',d.cbu||'',d.alias||'',Number(d.saldo_inicial||0),bool(d.activo ?? true)?1:0);
  }
  listBanks(req,res);
}

function listPos(req,res){
  const rows=db.prepare('SELECT * FROM puntos_venta WHERE empresa_id=? AND activo=1 ORDER BY numero').all(empresaId(req));
  res.json({ok:true,pointsOfSale:rows});
}
function savePos(req,res){
  const e=empresaId(req),d=req.body,numero=Number(d.numero);
  if(!Number.isInteger(numero)||numero<1||numero>99999)return res.status(400).json({ok:false,error:'El número de punto de venta es inválido.'});
  if(!d.nombre?.trim())return res.status(400).json({ok:false,error:'El nombre es obligatorio.'});
  const formato=String(d.formato_impresion||d.formatoImpresion||'A4').toUpperCase()==='80MM'?'80MM':'A4';
  const nombreFantasia=d.nombre_fantasia!=null?String(d.nombre_fantasia).trim():(d.nombreFantasia!=null?String(d.nombreFantasia).trim():'');
  const direccion=d.direccion!=null?String(d.direccion).trim():'';
  const telefono=d.telefono!=null?String(d.telefono).trim():'';
  const whatsapp=d.whatsapp!=null?String(d.whatsapp).trim():'';
  const email=d.email!=null?String(d.email).trim():'';
  try{
    if(req.params.id) db.prepare(`UPDATE puntos_venta SET numero=?,nombre=?,nombre_fantasia=?,direccion=?,telefono=?,whatsapp=?,email=?,sucursal_id=?,fiscal=?,activo=?,formato_impresion=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?`).run(numero,d.nombre.trim(),nombreFantasia,direccion,telefono,whatsapp,email,d.sucursal_id||null,bool(d.fiscal ?? true)?1:0,bool(d.activo ?? true)?1:0,formato,Number(req.params.id),e);
    else db.prepare(`INSERT INTO puntos_venta(empresa_id,sucursal_id,numero,nombre,nombre_fantasia,direccion,telefono,whatsapp,email,fiscal,activo,formato_impresion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(e,d.sucursal_id||null,numero,d.nombre.trim(),nombreFantasia,direccion,telefono,whatsapp,email,bool(d.fiscal ?? true)?1:0,bool(d.activo ?? true)?1:0,formato);
  }catch(err){if(String(err.message).includes('UNIQUE'))return res.status(409).json({ok:false,error:'Ese punto de venta ya existe para la empresa.'});throw err;}
  listPos(req,res);
}

function listChecks(req,res){
  const states=String(req.query.states||'').split(',').map(x=>x.trim()).filter(Boolean);
  let sql=`SELECT c.*, b.nombre banco_destino, cl.razon_social cliente_nombre, pv.nombre proveedor_nombre, op.numero orden_pago_numero, di.deposito_id, d.fecha fecha_deposito_registro, d.estado deposito_estado, d.banco_id deposito_banco_id, db.nombre deposito_banco_nombre FROM cheques c LEFT JOIN bancos b ON b.id=c.banco_destino_id LEFT JOIN clientes cl ON cl.id=c.cliente_id LEFT JOIN proveedores pv ON pv.id=c.proveedor_id LEFT JOIN ordenes_pago op ON op.id=c.comprobante_id AND c.comprobante_tipo='ORDEN_PAGO' LEFT JOIN cheque_deposito_items di ON di.cheque_id=c.id LEFT JOIN cheque_depositos d ON d.id=di.deposito_id LEFT JOIN bancos db ON db.id=d.banco_id WHERE c.empresa_id=?`;
  const params=[empresaId(req)];
  if(states.length){sql+=` AND c.estado IN (${states.map(()=>'?').join(',')})`;params.push(...states)}
  sql+=' ORDER BY COALESCE(c.fecha_vencimiento,c.created_at),c.id DESC';
  res.json({ok:true,checks:db.prepare(sql).all(...params)});
}
function createCheck(req,res){
  const e=empresaId(req),d=req.body;
  if(!d.numero?.trim()||Number(d.importe)<=0)return res.status(400).json({ok:false,error:'Número e importe son obligatorios.'});
  const info=db.prepare(`INSERT INTO cheques(empresa_id,numero,banco_origen,librador,importe,fecha_emision,fecha_vencimiento,estado,cliente_id,proveedor_id,comprobante_tipo,comprobante_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(e,d.numero.trim(),d.banco_origen||'',d.librador||'',Number(d.importe),d.fecha_emision||null,d.fecha_vencimiento||null,d.estado||'EN_CARTERA',d.cliente_id||null,d.proveedor_id||null,d.comprobante_tipo||null,d.comprobante_id||null);
  res.status(201).json({ok:true,check:db.prepare('SELECT * FROM cheques WHERE id=?').get(info.lastInsertRowid)});
}
function depositChecks(req,res){
  const e=empresaId(req),d=req.body,ids=Array.isArray(d.cheque_ids)?d.cheque_ids.map(Number).filter(Boolean):[];
  if(!d.banco_id||!ids.length)return res.status(400).json({ok:false,error:'Seleccioná banco y al menos un cheque.'});
  const tx=db.transaction(()=>{
    const checks=db.prepare(`SELECT * FROM cheques WHERE empresa_id=? AND id IN (${ids.map(()=>'?').join(',')}) AND estado IN ('EN_CARTERA','CARTERA','RECIBIDO')`).all(e,...ids);
    if(checks.length!==ids.length)throw Object.assign(new Error('Uno o más cheques no están disponibles en cartera.'),{status:409});
    const total=checks.reduce((n,c)=>n+Number(c.importe),0);
    const dep=db.prepare(`INSERT INTO cheque_depositos(empresa_id,banco_id,fecha,total) VALUES(?,?,?,?)`).run(e,Number(d.banco_id),d.fecha||nowLocal().slice(0,10),total);
    const ins=db.prepare('INSERT INTO cheque_deposito_items(deposito_id,cheque_id,importe) VALUES(?,?,?)');
    const upd=db.prepare(`UPDATE cheques SET estado='DEPOSITADO',banco_destino_id=?,fecha_deposito=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`);
    for(const c of checks){ins.run(dep.lastInsertRowid,c.id,c.importe);upd.run(Number(d.banco_id),d.fecha||nowLocal().slice(0,10),c.id)}
    return {id:dep.lastInsertRowid,total};
  });
  res.status(201).json({ok:true,deposit:tx()});
}

function listWhatsapp(req,res){
  const rows=db.prepare(`SELECT * FROM whatsapp_autorizados WHERE empresa_id=? ORDER BY activo DESC,nombre,telefono`).all(empresaId(req));
  res.json({ok:true,authorizedPhones:rows});
}
function saveWhatsapp(req,res){
  const e=empresaId(req),d=req.body,telefono=String(d.telefono||'').replace(/\D/g,'');
  if(telefono.length<8)return res.status(400).json({ok:false,error:'El teléfono es inválido.'});
  if(req.params.id) db.prepare(`UPDATE whatsapp_autorizados SET telefono=?,nombre=?,activo=?,puede_consultar=?,puede_presupuestar=?,puede_facturar=? WHERE id=? AND empresa_id=?`).run(telefono,d.nombre||'',bool(d.activo ?? true)?1:0,bool(d.puede_consultar)?1:0,bool(d.puede_presupuestar)?1:0,bool(d.puede_facturar)?1:0,Number(req.params.id),e);
  else db.prepare(`INSERT INTO whatsapp_autorizados(empresa_id,telefono,nombre,activo,puede_consultar,puede_presupuestar,puede_facturar) VALUES(?,?,?,?,?,?,?)`).run(e,telefono,d.nombre||'',bool(d.activo ?? true)?1:0,bool(d.puede_consultar)?1:0,bool(d.puede_presupuestar)?1:0,bool(d.puede_facturar)?1:0);
  listWhatsapp(req,res);
}

function uploadFiscal(req,res){
  if(!req.file)return res.status(400).json({ok:false,error:'No se recibió el archivo.'});
  const type=req.params.type==='key'?'LLAVE_PRIVADA':'CERTIFICADO';
  const e=empresaId(req);
  const previous=db.prepare('SELECT * FROM empresa_archivos_fiscales WHERE empresa_id=? AND tipo=?').get(e,type);
  if(previous?.ruta_segura&&fs.existsSync(previous.ruta_segura))fs.unlinkSync(previous.ruta_segura);
  db.prepare(`INSERT INTO empresa_archivos_fiscales(empresa_id,tipo,nombre_original,ruta_segura,mime_type,size_bytes) VALUES(?,?,?,?,?,?) ON CONFLICT(empresa_id,tipo) DO UPDATE SET nombre_original=excluded.nombre_original,ruta_segura=excluded.ruta_segura,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,activo=1,created_at=CURRENT_TIMESTAMP`).run(e,type,req.file.originalname,req.file.path,req.file.mimetype,req.file.size);
  // AFIPClient lee la ruta del certificado/llave directo de empresas.cert_path /
  // key_path (no de empresa_archivos_fiscales) — sin esto, subir el archivo
  // quedaba registrado pero la emisión de facturas seguía sin encontrarlo.
  const column=req.params.type==='key'?'key_path':'cert_path';
  db.prepare(`UPDATE empresas SET ${column}=? WHERE id=?`).run(req.file.path,e);
  res.json({ok:true,file:{type,name:req.file.originalname,size:req.file.size}});
}
function fiscalFiles(req,res){
  const e=empresaId(req);
  const rows=db.prepare('SELECT tipo,nombre_original,size_bytes,created_at FROM empresa_archivos_fiscales WHERE empresa_id=? AND activo=1').all(e);
  // A diferencia de "rows" (que solo dice si el archivo se subió), esto
  // confirma si empresas.cert_path / key_path -las columnas que realmente
  // usa AFIPClient al facturar- están seteadas. Son cosas distintas: se
  // puede haber subido el archivo sin que esto haya quedado conectado.
  const empresa=db.prepare('SELECT cert_path,key_path FROM empresas WHERE id=?').get(e);
  res.json({
    ok:true,
    files:rows,
    conectado:{
      certificado:Boolean(empresa?.cert_path),
      llave:Boolean(empresa?.key_path),
    },
  });
}


function listPurchases(req,res){
  const e=empresaId(req); const month=Number(req.query.month||0); const year=Number(req.query.year||0);
  let sql='SELECT * FROM compras WHERE empresa_id=?'; const params=[e];
  if(month){sql+=' AND mes_iva=?';params.push(month)} if(year){sql+=' AND anio_iva=?';params.push(year)}
  sql+=' ORDER BY fecha DESC,id DESC';
  const purchases=db.prepare(sql).all(...params).map(row=>({...row,iva_detalles:db.prepare('SELECT * FROM compra_iva_detalles WHERE compra_id=? ORDER BY alicuota').all(row.id),retenciones:db.prepare('SELECT * FROM compra_retenciones WHERE compra_id=? ORDER BY id').all(row.id)}));
  res.json({ok:true,purchases});
}
function savePurchase(req,res){
  const e=empresaId(req),d=req.body,details=Array.isArray(d.iva_detalles)?d.iva_detalles:[];
  if(!d.proveedor_nombre?.trim()||!d.tipo_comprobante||!d.numero||!d.fecha)return res.status(400).json({ok:false,error:'Proveedor, comprobante, número y fecha son obligatorios.'});
  if(!details.length)return res.status(400).json({ok:false,error:'Agregá al menos una alícuota de IVA.'});
  const neto=details.reduce((n,x)=>n+Number(x.neto||0),0),iva=details.reduce((n,x)=>n+Number(x.iva||0),0),totalIva=details.reduce((n,x)=>n+Number(x.total_con_iva||0),0);
  const taxRows=Array.isArray(d.retenciones)?d.retenciones:[];
  const signedTax=taxRows.reduce((n,x)=>{const nature=String(x.naturaleza||x.tipo||'').toUpperCase();const amount=Math.abs(Number(x.importe||0));return n+(nature.includes('RETEN')?-amount:amount)},0);
  const total=Number.isFinite(Number(d.total))?Number(d.total):totalIva+Number(d.exento_no_gravado||0)+signedTax;
  try{
    const tx=db.transaction(()=>{
      const info=db.prepare(`INSERT INTO compras(empresa_id,proveedor_nombre,proveedor_documento,proveedor_domicilio,proveedor_condicion_iva,tipo_documento,mes_iva,anio_iva,tipo_comprobante,letra,punto_venta,numero,fecha,fecha_vencimiento,concepto,moneda,cotizacion,condicion_pago,rubro_gasto,observaciones,afecta_caja,neto_gravado,exento_no_gravado,iva_total,percepciones_retenciones,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e,d.proveedor_nombre.trim(),d.proveedor_documento||'',d.proveedor_domicilio||'',d.proveedor_condicion_iva||'',d.tipo_documento||'CUIT',Number(d.mes_iva),Number(d.anio_iva),d.tipo_comprobante,d.letra||'',Number(d.punto_venta||1),String(d.numero),d.fecha,d.fecha_vencimiento||null,d.concepto||'PRODUCTOS',d.moneda||'PES',Number(d.cotizacion||1),d.condicion_pago||'CONTADO',d.rubro_gasto||'',d.observaciones||'',bool(d.afecta_caja)?1:0,neto,Number(d.exento_no_gravado||0),iva,signedTax,total);
      const ins=db.prepare('INSERT INTO compra_iva_detalles(compra_id,alicuota,neto,iva,total_con_iva) VALUES(?,?,?,?,?)');
      for(const x of details)ins.run(info.lastInsertRowid,Number(x.alicuota||0),Number(x.neto||0),Number(x.iva||0),Number(x.total_con_iva||0));
      const ir=db.prepare('INSERT INTO compra_retenciones(compra_id,tipo,descripcion,importe) VALUES(?,?,?,?)');for(const x of (d.retenciones||[]))if(Number(x.importe||0))ir.run(info.lastInsertRowid,x.tipo||'OTRA',x.descripcion||'',Number(x.importe));
      if(bool(d.afecta_caja)){db.prepare('INSERT INTO caja_movimientos(empresa_id,tipo,concepto,importe,medios_json,cliente_nombre) VALUES(?,?,?,?,?,?)').run(e,'EGRESO',`COMPRA #${info.lastInsertRowid}`,-Math.abs(total),JSON.stringify({medio:d.condicion_pago||'CONTADO',moneda:d.moneda||'PES'}),d.proveedor_nombre.trim());}
      return info.lastInsertRowid;
    });
    const id=tx(); req.query.month=d.mes_iva;req.query.year=d.anio_iva;listPurchases(req,res);
  }catch(err){if(String(err.message).includes('UNIQUE'))return res.status(409).json({ok:false,error:'Ese comprobante de compra ya fue registrado.'});throw err}
}

function deletePurchase(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const row=db.prepare('SELECT * FROM compras WHERE id=? AND empresa_id=?').get(id,e);
  if(!row)return res.status(404).json({ok:false,error:'Compra no encontrada.'});
  const tx=db.transaction(()=>{
    db.prepare('DELETE FROM compra_retenciones WHERE compra_id=?').run(id);
    db.prepare('DELETE FROM compra_iva_detalles WHERE compra_id=?').run(id);
    db.prepare('DELETE FROM caja_movimientos WHERE empresa_id=? AND concepto=?').run(e,`COMPRA #${id}`);
    db.prepare('DELETE FROM compras WHERE id=? AND empresa_id=?').run(id,e);
  });tx();res.json({ok:true});
}

function vatBook(req,res){
  const e=empresaId(req),month=Number(req.query.month||new Date().getMonth()+1),year=Number(req.query.year||new Date().getFullYear()),pv=Number(req.query.pv||0);
  const sales=db.prepare(`SELECT d.id,d.fecha,c.razon_social razon_social,c.cuit,d.tipo,d.punto_venta,d.numero,d.importe_neto neto,d.importe_iva iva,d.importe_total total FROM documentos_comerciales d LEFT JOIN clientes c ON c.id=d.cliente_id WHERE d.empresa_id=? AND CAST(strftime('%m',d.fecha) AS INTEGER)=? AND CAST(strftime('%Y',d.fecha) AS INTEGER)=? ${pv?'AND d.punto_venta=? ':''}AND (UPPER(d.tipo) LIKE 'FACTURA%' OR UPPER(d.tipo) LIKE 'NOTA DE CREDITO%' OR UPPER(d.tipo) LIKE 'NOTA DE CRÉDITO%' OR UPPER(d.tipo) LIKE 'NOTA DE DEBITO%' OR UPPER(d.tipo) LIKE 'NOTA DE DÉBITO%') ORDER BY d.fecha,d.id`).all(e,month,year,...(pv?[pv]:[])).map(r=>{const credit=/CREDITO|CRÉDITO/i.test(r.tipo);return {...r,neto:credit?-Math.abs(Number(r.neto||0)):Number(r.neto||0),iva:credit?-Math.abs(Number(r.iva||0)):Number(r.iva||0),total:credit?-Math.abs(Number(r.total||0)):Number(r.total||0)}});
  const purchases=db.prepare(`SELECT id,fecha,proveedor_nombre razon_social,proveedor_documento cuit,tipo_comprobante tipo,punto_venta,numero,neto_gravado neto,iva_total iva,total FROM compras WHERE empresa_id=? AND mes_iva=? AND anio_iva=? ORDER BY fecha,id`).all(e,month,year);
  const sum=(rows,key)=>rows.reduce((n,r)=>n+Number(r[key]||0),0);const debit=sum(sales,'iva'),credit=sum(purchases,'iva');
  const emp=db.prepare('SELECT razon_social,cuit FROM empresas WHERE id=?').get(e);
  res.json({ok:true,month,year,sales,purchases,empresa:{razonSocial:emp?.razon_social||'Mi empresa',cuit:emp?.cuit||''},summary:{debit,credit,balance:debit-credit,salesTotal:sum(sales,'total'),purchasesTotal:sum(purchases,'total')}});
}
function listReserveFunds(req,res){const rows=db.prepare(`SELECT r.*,c.razon_social cliente,c.cuit FROM reservas_monto r JOIN clientes c ON c.id=r.cliente_id WHERE r.empresa_id=? ORDER BY r.fecha DESC,r.id DESC`).all(empresaId(req));res.json({ok:true,reservations:rows.map(r=>({...r,precios_snapshot:JSON.parse(r.precios_snapshot||'{}')}))})}
function round2(n){return Math.round(Number(n||0)*100)/100;}
function nombreTipoResponsable(condicion){
  const c=String(condicion||'').toUpperCase();
  if(c.includes('RESPONSABLE')||c==='RI') return 'Responsable Inscripto';
  if(c.includes('MONOTRIBUTO')) return 'Monotributo';
  if(c.includes('EXENTO')) return 'Exento';
  return 'Consumidor Final';
}
function borradorIva(req,res){
  const e=empresaId(req),month=Number(req.query.month||new Date().getMonth()+1),year=Number(req.query.year||new Date().getFullYear()),pv=Number(req.query.pv||0);
  const rubros=db.prepare('SELECT id,nombre FROM rubros_productos WHERE empresa_id=? AND activo=1').all(e);
  const catRow=db.prepare('SELECT valor_json FROM app_state WHERE empresa_id=? AND clave=?').get(e,'afip_catalogs_v34');
  let catalogs=[];try{catalogs=JSON.parse(catRow?.valor_json||'[]')}catch{}
  const nombrePorId={};
  for(const c of catalogs){if(String(c.tipo||'').toUpperCase()==='RUBRO'&&c.id!=null)nombrePorId[String(c.id)]=String(c.nombre||`RUBRO ${c.id}`);}
  for(const r of rubros){if(r.id!=null&&!/^RUBRO \d+$/.test(String(r.nombre)))nombrePorId[String(r.id)]=String(r.nombre);}
  const nombreRubro=(rid)=>nombrePorId[String(rid)]||`RUBRO ${rid}`;
  const rubroDeProducto={};
  for(const p of db.prepare('SELECT id,rubro_id FROM productos WHERE empresa_id=?').all(e)){
    if(p.rubro_id!=null&&p.rubro_id!=='') rubroDeProducto[p.id]=String(p.rubro_id);
  }
  const ventas=db.prepare(`SELECT d.tipo,d.punto_venta,c.condicion_iva,i.producto_id,i.iva alicuota,i.subtotal,i.iva_importe
    FROM documentos_comerciales d
    LEFT JOIN clientes c ON c.id=d.cliente_id
    JOIN documento_items i ON i.documento_id=d.id
    WHERE d.empresa_id=? AND CAST(strftime('%m',d.fecha) AS INTEGER)=? AND CAST(strftime('%Y',d.fecha) AS INTEGER)=?
      AND (UPPER(d.tipo) LIKE 'FACTURA%' OR d.tipo='NOTA_CREDITO' OR d.tipo='NOTA_DEBITO')
      AND d.afip_estado='AUTORIZADO' ${pv?'AND d.punto_venta=? ':''}`).all(e,month,year,...(pv?[pv]:[]));
  const datos={};
  for(const v of ventas){
    const signo=/CREDITO/i.test(v.tipo)?-1:1;
    const ivaPorc=Number(v.alicuota||0);
    const bruto=Number(v.subtotal||0);
    let iva=Number(v.iva_importe||0);
    let gravado=bruto;
    if(iva<=0&&ivaPorc>0){iva=round2(bruto*ivaPorc/(100+ivaPorc));gravado=round2(bruto-iva);}
    const rubro=rubroDeProducto[v.producto_id]!=null?nombreRubro(rubroDeProducto[v.producto_id]):'SIN RUBRO';
    const resp=nombreTipoResponsable(v.condicion_iva);
    const key=`${rubro}|${resp}|${ivaPorc}`;
    const d=datos[key]||(datos[key]={rubro,resp,ivaPorc,total:0,gravado:0,iva:0});
    d.total+=signo*round2(gravado+iva);d.gravado+=signo*gravado;d.iva+=signo*iva;
  }
  const filas=Object.values(datos).sort((a,b)=>String(a.rubro).localeCompare(String(b.rubro))||String(a.resp).localeCompare(String(b.resp))||Number(a.ivaPorc)-Number(b.ivaPorc));
  const ventasPorRubro=[];
  for(const f of filas){
    let r=ventasPorRubro.find(x=>x.rubro===f.rubro);
    if(!r){r={rubro:f.rubro,rubroId:rubros.find(x=>x.nombre===f.rubro)?.id||null,filas:[],totalRubro:{total:0,gravado:0,iva:0}};ventasPorRubro.push(r);}
    r.filas.push({tipoResponsable:f.resp,alicuota:Number(f.ivaPorc),total:round2(f.total),gravado:round2(f.gravado),iva:round2(f.iva)});
    r.totalRubro.total=round2(r.totalRubro.total+f.total);
    r.totalRubro.gravado=round2(r.totalRubro.gravado+f.gravado);
    r.totalRubro.iva=round2(r.totalRubro.iva+f.iva);
  }
  const sumaRubros=ventasPorRubro.reduce((acc,r)=>({total:round2(acc.total+r.totalRubro.total),gravado:round2(acc.gravado+r.totalRubro.gravado),iva:round2(acc.iva+r.totalRubro.iva)}),{total:0,gravado:0,iva:0});
  const compras=db.prepare(`SELECT proveedor_nombre,proveedor_documento,tipo_comprobante,letra,punto_venta,numero,fecha,neto_gravado,iva_total,percepciones_retenciones,total FROM compras WHERE empresa_id=? AND mes_iva=? AND anio_iva=? ORDER BY fecha,id`).all(e,month,year);
  let gravadoCompras=0,ivaCompras=0,totalCompras=0;
  for(const c of compras){
    const esA=String(c.letra||'').toUpperCase()==='A';
    let iva=Number(c.iva_total||0),gravado=Number(c.neto_gravado||0);
    if(!esA&&iva<=0&&gravado<=0&&Number(c.total)>0){iva=round2(Number(c.total)*21/121);gravado=round2(Number(c.total)-iva);}
    if(!esA&&iva>0&&gravado<=0){gravado=round2(iva*100/21);}
    gravadoCompras=round2(gravadoCompras+gravado);
    ivaCompras=round2(ivaCompras+iva);
    totalCompras=round2(totalCompras+Number(c.total||0));
  }
  const ajustes=db.prepare(`SELECT tipo,importe,detalle FROM borrador_iva_ajustes WHERE empresa_id=? AND mes_iva=? AND anio_iva=?`).all(e,month,year);
  const restitucionCredito=round2(Number(ajustes.find(a=>a.tipo==='RESTITUCION_CREDITO')?.importe||0));
  const restitucionDebito=round2(Number(ajustes.find(a=>a.tipo==='RESTITUCION_DEBITO')?.importe||0));
  const debitoFinal=round2(sumaRubros.iva-restitucionDebito);
  const creditoFinal=round2(ivaCompras-restitucionCredito);
  const resultado=round2(debitoFinal-creditoFinal);
  const retencionesPercepciones=compras.filter(c=>Number(c.percepciones_retenciones)>0).map(c=>({cuit:c.proveedor_documento||'',fecha:c.fecha,puntoVenta:Number(c.punto_venta||0),numero:String(c.numero||''),razonSocial:c.proveedor_nombre||'',tipo:'RET./PERC.',importe:round2(c.percepciones_retenciones)}));
  const emp=db.prepare('SELECT razon_social,nombre_fantasia,cuit,email,telefono,whatsapp,direccion,localidad,provincia,web FROM empresas WHERE id=?').get(e)||{};
  const pvs=db.prepare('SELECT id,numero,nombre,nombre_fantasia FROM puntos_venta WHERE empresa_id=? AND activo=1 ORDER BY numero').all(e);
  res.json({ok:true,month,year,pv: pv||0,puntosVenta:pvs,empresa:{razonSocial:emp.razon_social||'Mi empresa',cuit:emp.cuit||'',nombreFantasia:emp.nombre_fantasia||'',email:emp.email||'',telefono:emp.telefono||'',whatsapp:emp.whatsapp||'',direccion:emp.direccion||'',localidad:emp.localidad||'',provincia:emp.provincia||'',web:emp.web||''},ventasPorRubro,sumaRubros,compras:{cantidad:compras.length,total:totalCompras,gravado:gravadoCompras,iva:ivaCompras},ajustes,resumen:{ivaVentas:sumaRubros.iva,ivaCompras,restitucionCredito,restitucionDebito,debitoFinal,creditoFinal,resultado},retencionesPercepciones});
}
function saveBorradorIvaAjuste(req,res){
  const e=empresaId(req),d=req.body||{},month=Number(d.mes_iva||d.month),year=Number(d.anio_iva||d.year),tipo=String(d.tipo||'').toUpperCase();
  if(!month||!year||!['RESTITUCION_CREDITO','RESTITUCION_DEBITO'].includes(tipo))return res.status(400).json({ok:false,error:'Período y tipo de restitución inválidos.'});
  const importe=Math.max(0,Number(d.importe||0));
  db.prepare(`INSERT INTO borrador_iva_ajustes(empresa_id,mes_iva,anio_iva,tipo,importe,detalle,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(empresa_id,mes_iva,anio_iva,tipo) DO UPDATE SET importe=excluded.importe,detalle=excluded.detalle,updated_at=excluded.updated_at`).run(e,month,year,tipo,importe,String(d.detalle||'').trim());
  res.json({ok:true,ajuste:{mes_iva:month,anio_iva:year,tipo,importe,detalle:String(d.detalle||'').trim()}});
}
function renameBorradorIvaRubro(req,res){
  const e=empresaId(req),id=Number(req.params.id),nombre=String(req.body?.nombre||'').trim();
  if(!id||!nombre)return res.status(400).json({ok:false,error:'Nombre de rubro inválido.'});
  const r=db.prepare('SELECT id FROM rubros_productos WHERE id=? AND empresa_id=?').get(id,e);
  if(r){db.prepare('UPDATE rubros_productos SET nombre=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nombre,id);}
  else{db.prepare('INSERT INTO rubros_productos(id,empresa_id,nombre,activo) VALUES(?,?,?,1)').run(id,e,nombre);}
  res.json({ok:true,rubro:{id,nombre}});
}
function updatePrices(req,res){
  const e=empresaId(req),d=req.body||{};
  const filtro=String(d.filtro||'TODOS').toUpperCase();
  const direccion=String(d.direccion||'AUMENTA').toUpperCase();
  const modalidad=String(d.modalidad||'PORCENTAJE').toUpperCase();
  const valor=Math.abs(Number(d.valor||0));
  const ids=(Array.isArray(d.ids)?d.ids:[]).map(x=>String(x));
  if(!valor)return res.status(400).json({ok:false,error:'Ingresá un valor mayor a cero.'});
  if(!['TODOS','RUBRO','SUBRUBRO','MARCA','PROVEEDOR','TIPO'].includes(filtro))return res.status(400).json({ok:false,error:'Filtro inválido.'});
  const setFor=(col)=>ids.length?db.prepare(`SELECT id FROM productos WHERE empresa_id=? AND activo=1 AND ${col} IN (${ids.map(()=>'?').join(',')})`).all(e,...ids).map(r=>r.id):[];
  let productoIds=[];
  if(filtro==='TODOS'){productoIds=db.prepare('SELECT id FROM productos WHERE empresa_id=? AND activo=1').all(e).map(r=>r.id);}
  else if(filtro==='RUBRO'){productoIds=setFor('rubro_id');}
  else if(filtro==='SUBRUBRO'){productoIds=setFor('subrubro_id');}
  else if(filtro==='MARCA'){productoIds=setFor('marca_id');}
  else if(filtro==='TIPO'){
    const catalogsRow=db.prepare('SELECT valor_json FROM app_state WHERE empresa_id=? AND clave=?').get(e,'afip_catalogs_v34');
    let catalogs=[];try{catalogs=JSON.parse(catalogsRow?.valor_json||'[]')}catch{}
    const tiposValidos=['RUBRO','SUBRUBRO','MARCA'];
    const items=catalogs.filter((c)=>tiposValidos.includes(String(c.tipo||'').toUpperCase())&&ids.includes(String(c.id)));
    const byCol={RUBRO:'rubro_id',SUBRUBRO:'subrubro_id',MARCA:'marca_id'};
    const acc=new Set();
    for(const it of items){for(const id of setFor(byCol[String(it.tipo).toUpperCase()]))acc.add(id)}
    productoIds=[...acc];
  }
  else if(filtro==='PROVEEDOR'){
    const linksRow=db.prepare('SELECT valor_json FROM app_state WHERE empresa_id=? AND clave=?').get(e,'afip_product_suppliers_v35');
    let links=[];try{links=JSON.parse(linksRow?.valor_json||'[]')}catch{}
    const acc=new Set();
    for(const l of links){if(ids.includes(String(l.proveedorId))){if(l.productId)acc.add(Number(l.productId));}}
    productoIds=[...acc];
  }
  if(!productoIds.length)return res.status(200).json({ok:true,actualizados:0,productos:0,mensaje:'No hay productos que coincidan con el filtro seleccionado.'});
  const total=db.prepare('SELECT COUNT(*) n FROM productos WHERE empresa_id=? AND activo=1').get(e).n;
  const chunk=db.transaction((rows)=>{
    const up=db.prepare('UPDATE productos SET precio=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?');
    for(const id of rows){const p=db.prepare('SELECT precio FROM productos WHERE id=? AND empresa_id=?').get(id,e);if(!p)continue;let nuevo=Number(p.precio||0);nuevo=modalidad==='ABSOLUTO'?(direccion==='DISMINUYE'?nuevo-valor:nuevo+valor):(direccion==='DISMINUYE'?nuevo*(1-valor/100):nuevo*(1+valor/100));nuevo=Math.round(Math.max(0,nuevo)*100)/100;up.run(nuevo,id,e);}
  });
  chunk(productoIds);
  res.json({ok:true,actualizados:productoIds.length,productos:total,filtro,direccion,modalidad,valor,mensaje:`Se actualizaron ${productoIds.length} producto(s).`});
}
function createReserveFund(req,res){const e=empresaId(req),d=req.body,amount=Number(d.importe_original||d.importe||0);if(!d.cliente_id||amount<=0)return res.status(400).json({ok:false,error:'Cliente e importe son obligatorios.'});const count=db.prepare('SELECT COUNT(*) n FROM reservas_monto WHERE empresa_id=?').get(e).n;const number=`RM-${String(count+1).padStart(8,'0')}`;const products=db.prepare('SELECT id,codigo,precio FROM productos WHERE empresa_id=? AND activo=1').all(e);const snapshot=Object.fromEntries(products.map(p=>[String(p.id),{codigo:p.codigo,precio:Number(p.precio)}]));const info=db.prepare(`INSERT INTO reservas_monto(empresa_id,cliente_id,numero,fecha,importe_original,saldo,lista_precio_id,lista_precio_nombre,precios_snapshot,observaciones) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(e,Number(d.cliente_id),number,d.fecha||nowLocal().slice(0,10),amount,amount,d.lista_precio_id||null,d.lista_precio_nombre||'GENERAL',JSON.stringify(snapshot),d.observaciones||'');res.status(201).json({ok:true,reservation:db.prepare('SELECT * FROM reservas_monto WHERE id=?').get(info.lastInsertRowid)})}
function consumeReserveFund(req,res){const e=empresaId(req),id=Number(req.params.id),amount=Number(req.body.importe||0);const tx=db.transaction(()=>{const r=db.prepare('SELECT * FROM reservas_monto WHERE id=? AND empresa_id=?').get(id,e);if(!r)throw Object.assign(new Error('Reserva inexistente.'),{status:404});if(amount<=0||amount>Number(r.saldo))throw Object.assign(new Error('El importe supera el saldo reservado.'),{status:409});db.prepare('UPDATE reservas_monto SET saldo=saldo-?,estado=CASE WHEN saldo-?<=0 THEN \'AGOTADA\' ELSE \'VIGENTE\' END,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(amount,amount,id);db.prepare('INSERT INTO reserva_monto_consumos(reserva_id,documento_tipo,documento_id,importe,detalle) VALUES(?,?,?,?,?)').run(id,req.body.documento_tipo||'POS',req.body.documento_id||null,amount,req.body.detalle||'Consumo desde punto de venta');return db.prepare('SELECT * FROM reservas_monto WHERE id=?').get(id)});res.json({ok:true,reservation:tx()})}

module.exports={listBanks,saveBank,listPos,savePos,listChecks,createCheck,depositChecks,listWhatsapp,saveWhatsapp,uploadFiscal,fiscalFiles,listPurchases,savePurchase,deletePurchase,vatBook,borradorIva,saveBorradorIvaAjuste,renameBorradorIvaRubro,updatePrices,listReserveFunds,createReserveFund,consumeReserveFund};

function userId(req){ return Number(req.user?.id || req.user?.userId || 1); }
function listPosCatalogs(req,res){
  const e=empresaId(req);
  const branches=db.prepare('SELECT * FROM sucursales WHERE empresa_id=? AND activo=1 ORDER BY nombre').all(e);
  const cashiers=db.prepare('SELECT * FROM cajeros WHERE empresa_id=? AND activo=1 ORDER BY nombre').all(e);
  const sellers=db.prepare('SELECT * FROM vendedores WHERE empresa_id=? AND activo=1 ORDER BY nombre').all(e);
  const pointsOfSale=db.prepare('SELECT * FROM puntos_venta WHERE empresa_id=? AND activo=1 ORDER BY numero').all(e);
  res.json({ok:true,branches,cashiers,sellers,pointsOfSale});
}

/*
 * Puntos de venta asignados al usuario que inicia sesión. Si el usuario
 * no tiene asignación (usuarios previos a la migración), devuelve todos
 * los puntos de venta activos para no romper el flujo existente.
 */
function misPuntosVenta(req,res){
  const e=empresaId(req);
  const uid=Number(req.usuario?.id||req.user?.id||0);
  const asignados=db.prepare(`SELECT up.punto_venta_id,up.predeterminado,p.numero,p.nombre FROM usuario_puntos_venta up JOIN puntos_venta p ON p.id=up.punto_venta_id AND p.empresa_id=up.empresa_id WHERE up.empresa_id=? AND up.usuario_id=? ORDER BY p.numero`).all(e,uid);
  const todos=db.prepare('SELECT * FROM puntos_venta WHERE empresa_id=? AND activo=1 ORDER BY numero').all(e);
  const puntosVenta=(asignados.length?asignados:todos).map(r=>({id:Number(r.punto_venta_id||r.id),numero:Number(r.numero),nombre:r.nombre,predeterminado:Boolean(r.predeterminado)}));
  const predeterminado=puntosVenta.find(p=>p.predeterminado)||puntosVenta[0]||null;
  res.json({ok:true,puntosVenta,predeterminado});
}

/*
 * Guarda el logo del punto de venta (data URL de imagen) para que ese
 * PV imprima sus comprobantes con su propia imagen. Enviar logo vacío
 * quita el logo propio y vuelve al logo general de la empresa.
 */
function subirLogoPos(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const row=db.prepare('SELECT id FROM puntos_venta WHERE id=? AND empresa_id=?').get(id,e);
  if(!row)return res.status(404).json({ok:false,error:'Punto de venta no encontrado.'});
  const logo=String(req.body?.logo||'').trim();
  if(logo&&!logo.startsWith('data:image/'))return res.status(400).json({ok:false,error:'El logo debe ser una imagen en formato data URL.'});
  db.prepare('UPDATE puntos_venta SET logo=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?').run(logo||null,id,e);
  res.json({ok:true,logo:logo||null});
}
function nextNumber(e,pv,type){
  const tx=db.transaction(()=>{
    db.prepare('INSERT OR IGNORE INTO pos_numeradores(empresa_id,punto_venta,tipo,ultimo_numero) VALUES(?,?,?,0)').run(e,pv,type);
    db.prepare('UPDATE pos_numeradores SET ultimo_numero=ultimo_numero+1 WHERE empresa_id=? AND punto_venta=? AND tipo=?').run(e,pv,type);
    return db.prepare('SELECT ultimo_numero n FROM pos_numeradores WHERE empresa_id=? AND punto_venta=? AND tipo=?').get(e,pv,type).n;
  });
  return tx();
}
function openOrGetCashSession(e,d,uid){
  const pv=Number(d.punto_venta)||null;
  let s=db.prepare("SELECT * FROM caja_sesiones WHERE empresa_id=? AND estado='ABIERTA' AND COALESCE(cajero_id,0)=COALESCE(?,0) AND COALESCE(sucursal_id,0)=COALESCE(?,0) AND COALESCE(punto_venta,0)=COALESCE(?,0) ORDER BY id DESC LIMIT 1").get(e,d.cajero_id||null,d.sucursal_id||null,pv);
  if(!s){const info=db.prepare('INSERT INTO caja_sesiones(empresa_id,sucursal_id,cajero_id,usuario_id,importe_apertura,saldo_teorico,punto_venta) VALUES(?,?,?,?,0,0,?)').run(e,d.sucursal_id||null,d.cajero_id||null,uid,pv);s=db.prepare('SELECT * FROM caja_sesiones WHERE id=?').get(info.lastInsertRowid)}
  return s;
}
async function createPosOperation(req,res){const e=empresaId(req);limpiarNotasVenta(e);
  limpiarNotasVenta(e);const uid=userId(req),d=req.body,rawItems=Array.isArray(d.items)?d.items:[];
  if(!rawItems.length)return res.status(400).json({ok:false,error:'La operación no tiene artículos.'});
  const mode=String(d.mode||'NORMAL').toUpperCase();
  const reserveWithdrawal=Boolean(d.reserva_monto_id);
  if(['RESERVA','PEDIDO'].includes(mode)&&!d.cliente_id)return res.status(400).json({ok:false,error:'El cliente es obligatorio para reservas y notas de pedido.'});
  if(mode==='PEDIDO'&&!d.vendedor_id)return res.status(400).json({ok:false,error:'El vendedor es obligatorio para la nota de pedido.'});
  if(reserveWithdrawal&&mode!=='NORMAL')return res.status(400).json({ok:false,error:'La reserva por monto solo puede retirarse mediante un remito independiente.'});
  if(reserveWithdrawal&&!d.cliente_id)return res.status(400).json({ok:false,error:'El retiro de una reserva por monto exige seleccionar su cliente.'});
  let reserve=null;
  let items=rawItems;
  if(reserveWithdrawal){
    reserve=db.prepare("SELECT * FROM reservas_monto WHERE id=? AND empresa_id=? AND estado='VIGENTE'").get(Number(d.reserva_monto_id),e);
    if(!reserve)return res.status(404).json({ok:false,error:'La reserva por monto no existe o ya no está vigente.'});
    if(Number(reserve.cliente_id)!==Number(d.cliente_id))return res.status(409).json({ok:false,error:'La reserva seleccionada no pertenece al cliente de la operación.'});
    let snapshot={};try{snapshot=JSON.parse(reserve.precios_snapshot||'{}')}catch{}
    try{
      items=rawItems.map(item=>{
        const productId=String(item.producto_id||item.id||'');
        const frozen=snapshot[productId];
        if(!frozen||frozen.precio==null)throw new Error(`El producto ${item.descripcion||item.codigo||productId} no estaba incluido en la lista de precios reservada.`);
        return {...item,precio_unitario:Number(frozen.precio),precio:Number(frozen.precio)};
      });
    }catch(error){return res.status(409).json({ok:false,error:error.message});}
  }
  const pv=Number(d.punto_venta||db.prepare('SELECT numero FROM puntos_venta WHERE empresa_id=? AND activo=1 ORDER BY numero LIMIT 1').get(e)?.numero||1);
  const type=reserveWithdrawal?'REMITO':mode==='NORMAL'?(d.document_kind==='NOTA_X'?'NOTA_X':'FACTURA'):mode==='PEDIDO'?'NOTA_PEDIDO':(mode==='REMITO_X'||mode==='REMITO_R')?'REMITO':mode;
  const remitoSub=mode==='REMITO_R'?'R':(mode==='REMITO_X'?'X':null);
  const accountSale=!reserveWithdrawal&&['CTA_CTE','CUENTA_CORRIENTE','CUENTA CORRIENTE'].includes(String(d.condicion_pago||'').toUpperCase());
  const operationCondition=reserveWithdrawal?'RESERVA_MONTO':d.condicion_pago||'CONTADO';
  if(accountSale&&!d.cliente_id)return res.status(400).json({ok:false,error:'La cuenta corriente exige seleccionar un cliente del sistema.'});
  let asociada=null;
  if(type==='NOTA_CREDITO'||type==='NOTA_DEBITO'){
    if(!d.cliente_id)return res.status(400).json({ok:false,error:'La nota de crédito o débito exige seleccionar un cliente del sistema.'});
    if(!d.factura_asociada_id)return res.status(400).json({ok:false,error:'Seleccioná la factura asociada para emitir la nota.'});
    asociada=db.prepare(`SELECT v.id,v.cliente_id,v.condicion_pago,d.id documento_id,d.cae cae_original,d.punto_venta pv_original,d.numero numero_original,d.comprobante_tipo_afip tipo_afip_original FROM ventas_pos v JOIN documentos_comerciales d ON d.id=v.documento_id WHERE v.id=? AND v.empresa_id=? AND v.tipo='FACTURA' AND d.afip_estado='AUTORIZADO'`).get(Number(d.factura_asociada_id),e);
    if(!asociada)return res.status(422).json({ok:false,error:'La factura asociada no existe o no está autorizada por ARCA.'});
  }
  const calculatedSubtotal=items.reduce((n,x)=>n+Number(x.precio_unitario||x.precio||0)*Number(x.cantidad||0)*(1-Number(x.descuento||0)/100),0);
  let subtotal=reserveWithdrawal?calculatedSubtotal:Number(d.subtotal||calculatedSubtotal);
  let total=reserveWithdrawal?calculatedSubtotal:Number(d.total||subtotal);
  let importeIva=total-subtotal;

  // La factura electrónica requiere autorización de AFIP (CAE) ANTES de
  // persistir nada: es una llamada de red, no puede ir dentro de la
  // transacción sincrónica de SQLite. Si AFIP rechaza el comprobante, la
  // venta no se registra (ni stock, ni caja, ni cuenta corriente). Si ARCA
  // no responde (caída de red/timeout), la venta se registra como
  // PENDIENTE de CAE para no perder la operación y poder reintentarla.
  const cfg=comprobanteConfig(e,type);
  if(cfg.requiere_cliente&&!d.cliente_id&&!(type==='REMITO'&&mode==='REMITO_X'))return res.status(400).json({ok:false,error:'Este comprobante requiere un cliente del sistema.'});
  if(cfg.requiere_vendedor&&!d.vendedor_id)return res.status(400).json({ok:false,error:'Este comprobante requiere seleccionar un vendedor.'});
  let number;
  let fiscal=null;
  let fiscalPendiente=null;
  const esFiscal=type==='FACTURA'||type==='NOTA_CREDITO'||type==='NOTA_DEBITO';
  if(esFiscal){
    try{
      fiscal=await emitirFacturaAfip({empresaId:e,puntoVenta:pv,clienteId:d.cliente_id||null,clienteNombre:d.cliente_nombre,items,operacion:type,cbteAsoc:type==='FACTURA'?null:[{tipo:asociada.tipo_afip_original,puntoVenta:asociada.pv_original,numero:asociada.numero_original}]});
    }catch(error){
      if(error instanceof FiscalNetworkError){
        fiscalPendiente={error:error.message,intentoId:error.intentoId};
      }else{
        return res.status(422).json({ok:false,error:error.message||'No se pudo emitir el comprobante electrónico.'});
      }
    }
    if(!fiscalPendiente&&!fiscal.ok){
      return res.status(422).json({ok:false,error:'AFIP rechazó el comprobante. La venta no se registró.',detalle:fiscal.observaciones||fiscal.errores||fiscal.resultado||null});
    }
    if(fiscal&&fiscal.ok){
      number=fiscal.numero;
      subtotal=fiscal.importeNeto;
      importeIva=fiscal.importeIva;
      total=fiscal.importeTotal;
    }else{
      number=nextNumber(e,pv,cfg.numerador_tipo||type);
    }
  }else{
    number=nextNumber(e,pv,cfg.numerador_tipo||type);
  }

  const chequeMonto=Number((d.pagos||{}).CHEQUE||(d.pagos||{}).cheque||0);
  if(chequeMonto>0&&!(d.cheques||[]).some(c=>Number(c.importe)>0)){
    return res.status(400).json({ok:false,error:'Ingresá al menos un cheque (número e importe) para pagar con CHEQUE.'});
  }

  const tx=db.transaction(()=>{
    if(fiscal){
      db.prepare('INSERT INTO pos_numeradores(empresa_id,punto_venta,tipo,ultimo_numero) VALUES(?,?,?,?) ON CONFLICT(empresa_id,punto_venta,tipo) DO UPDATE SET ultimo_numero=excluded.ultimo_numero WHERE excluded.ultimo_numero>ultimo_numero').run(e,pv,type,number);
    }
    const docOrigen = type==='FACTURA'&&d.documentoOrigenId?db.prepare('SELECT id,tipo,punto_venta,numero,estado,cliente_id FROM documentos_comerciales WHERE id=? AND empresa_id=?').get(Number(d.documentoOrigenId),e):null;
    const doc=db.prepare(`INSERT INTO documentos_comerciales(empresa_id,cliente_id,vendedor_id,tipo,estado,punto_venta,numero,fecha,condicion_venta,observaciones,importe_neto,importe_iva,importe_total,importe_bruto,descuento_general,descuento_importe,canal,subtipo,cae,cae_vencimiento,comprobante_tipo_afip,comprobante_letra,afip_resultado,afip_observaciones,afip_estado,documento_origen_id,documento_origen_tipo,documento_origen_punto_venta,documento_origen_numero) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e,d.cliente_id||null,d.vendedor_id||null,type,['RESERVA','PEDIDO','PRESUPUESTO','REMITO_R'].includes(mode)||type==='NOTA_X'?'BORRADOR':'CONFIRMADO',pv,number,nowLocal(),operationCondition,d.observaciones||'',subtotal,importeIva,total,brutoYDescuento(subtotal,d.descuento_general).bruto,Number(d.descuento_general||0),brutoYDescuento(subtotal,d.descuento_general).descuento,'POS',type==='REMITO'?(remitoSub||'X'):null,fiscal?.cae||null,fiscal?.vencimiento||null,fiscal?.tipoComprobante||null,fiscal?.letra||null,fiscal?.resultado||(fiscalPendiente?'PENDIENTE':null),afipObservacionesDe(fiscal,fiscalPendiente),afipEstadoDe(fiscal,fiscalPendiente),docOrigen?.id||null,docOrigen?.tipo||null,docOrigen?.punto_venta||null,docOrigen?.numero||null);
    const insDoc=db.prepare('INSERT INTO documento_items(documento_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    const empresaFiscal=db.prepare('SELECT condicion_iva FROM empresas WHERE id=?').get(e);
    const discriminaIva=String(empresaFiscal?.condicion_iva||'').toUpperCase()==='RESPONSABLE INSCRIPTO';
    for(const x of items){const netoLine=Number(x.precio_unitario||x.precio||0)*Number(x.cantidad||0)*(1-Number(x.descuento||0)/100);const ivaPorc=Number(x.iva||21);const netoFiscal=discriminaIva?netoLine:(ivaPorc>0?Math.round(netoLine*(1+ivaPorc/100)*100)/100:netoLine);const ivaLine=discriminaIva?Math.round(netoLine*ivaPorc/100*100)/100:0;insDoc.run(doc.lastInsertRowid,x.esManual?null:(x.producto_id||x.id||null),x.codigo||'',x.descripcion,x.unidad||'UN',Number(x.cantidad),Number(x.precio_unitario||x.precio||0),Number(x.descuento||0),ivaPorc,Math.round(netoFiscal*100)/100,ivaLine,Math.round((netoFiscal+ivaLine)*100)/100)}
    const esNota=type==='NOTA_CREDITO'||type==='NOTA_DEBITO';
  const mueveCaja=!accountSale&&!reserveWithdrawal&&(mode==='NORMAL'||esNota);
  const session=mueveCaja?openOrGetCashSession(e,d,uid):null;
    const pvPrint=db.prepare('SELECT formato_impresion FROM puntos_venta WHERE empresa_id=? AND numero=?').get(e,pv)?.formato_impresion||'A4';
    const printFormat=cfg.formato_impresion!=='PUNTO_VENTA'?cfg.formato_impresion:pvPrint;
    const sale=db.prepare(`INSERT INTO ventas_pos(empresa_id,sucursal_id,cajero_id,caja_sesion_id,cliente_id,vendedor_id,punto_venta,numero,tipo,estado,condicion_pago,observaciones,subtotal,descuento_general,recargo_general,descuento_promociones,total,vuelto,documento_id,reserva_monto_id,formato_impresion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e,d.sucursal_id||null,d.cajero_id||null,session?.id||null,d.cliente_id||null,d.vendedor_id||null,pv,number,type,['RESERVA','PEDIDO','PRESUPUESTO','REMITO_R'].includes(mode)||type==='NOTA_X'?'PENDIENTE':'CONFIRMADA',operationCondition,d.observaciones||'',subtotal,Number(d.descuento_general||0),Number(d.recargo_general||0),Number(d.descuento_promociones||0),total,Number(d.vuelto||0),doc.lastInsertRowid,d.reserva_monto_id||null,printFormat);
    if(type==='FACTURA'&&d.vendedor_id){const vendedor=db.prepare('SELECT comision_porcentaje FROM vendedores WHERE id=? AND empresa_id=?').get(d.vendedor_id,e);if(vendedor&&Number(vendedor.comision_porcentaje||0)>0){const clienteDoc=db.prepare('SELECT cuit,dni FROM clientes WHERE id=? AND empresa_id=?').get(d.cliente_id||0,e)||{};registrarComision({empresaId:e,vendedorId:d.vendedor_id,origenTipo:'FACTURA',origenId:sale.lastInsertRowid,clienteDoc:clienteDoc.cuit||clienteDoc.dni||'0',clienteNombre:d.cliente_nombre||clientQuery,baseCalculo:total,porcentaje:Number(vendedor.comision_porcentaje),observaciones:`Comisión por FACTURA ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')} POS`})}}
    if(fiscal?.intentoId||fiscalPendiente?.intentoId){
      db.prepare('UPDATE fiscal_intentos SET venta_id=?,documento_id=? WHERE id=?').run(sale.lastInsertRowid,doc.lastInsertRowid,Number(fiscal?.intentoId||fiscalPendiente?.intentoId));
    }
    const insItem=db.prepare('INSERT INTO venta_pos_items(venta_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,costo_unitario,subtotal,promocion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    for(const x of items){const line=Number(x.precio_unitario||x.precio||0)*Number(x.cantidad||0)*(1-Number(x.descuento||0)/100);insItem.run(sale.lastInsertRowid,x.esManual?null:(x.producto_id||x.id||null),x.codigo||'',x.descripcion,x.unidad||'UN',Number(x.cantidad),Number(x.precio_unitario||x.precio||0),Number(x.descuento||0),Number(x.iva||21),Number(x.costo||0),line,bool(x.promocion)?1:0)}
    if(mueveCaja&&(cfg.registra_caja||esNota)){
      const pay=db.prepare('INSERT INTO venta_pos_pagos(venta_id,medio,importe,detalle_json) VALUES(?,?,?,?)');
      for(const [medio,importeRaw] of Object.entries(d.pagos||{})){const importe=Number(importeRaw||0);if(importe>0)pay.run(sale.lastInsertRowid,String(medio).toUpperCase(),importe,null)}
      const transferencia=Number((d.pagos||{}).TRANSFERENCIA||(d.pagos||{}).transferencia||0);
      if(transferencia>0)registrarTransferenciaBancaria(e,{bancoId:d.banco_id_transferencia,concepto:`VENTA ${type} ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')} TRANSFERENCIA`,importe:transferencia,origenTipo:'VENTA_TRANSFERENCIA',origenId:sale.lastInsertRowid});
      const importeCaja=esNota&&type==='NOTA_CREDITO'?-Math.abs(total):Math.abs(total);
      db.prepare('INSERT INTO caja_movimientos(empresa_id,tipo,concepto,importe,medios_json,cliente_nombre,caja_sesion_id,sucursal_id,cajero_id,venta_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(e,esNota?type:'VENTA',`${type} ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')}`,importeCaja,JSON.stringify(d.pagos||{}),d.cliente_nombre||'CONSUMIDOR FINAL',session.id,d.sucursal_id||null,d.cajero_id||null,sale.lastInsertRowid);
      db.prepare('UPDATE caja_sesiones SET saldo_teorico=saldo_teorico+? WHERE id=?').run(importeCaja,session.id);
      for(const c of (d.cheques||[])) if(Number(c.importe)>0) db.prepare(`INSERT INTO cheques(empresa_id,numero,banco_origen,librador,importe,fecha_emision,fecha_vencimiento,estado,cliente_id,comprobante_tipo,comprobante_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(e,String(c.numero||''),c.banco||'',c.librador||'',Math.abs(Number(c.importe)),nowLocal().slice(0,10),c.vencimiento||null,'EN_CARTERA',d.cliente_id||null,type,sale.lastInsertRowid);
    }
    if((mode==='NORMAL'||mode==='REMITO_X')&&cfg.descuenta_stock){
      const branch=db.prepare('SELECT deposito_id FROM sucursales WHERE id=? AND empresa_id=?').get(d.sucursal_id||0,e);
      const depositoId=branch?.deposito_id||db.prepare('SELECT id FROM depositos WHERE empresa_id=? AND activo=1 ORDER BY id LIMIT 1').get(e)?.id;
      if(depositoId){for(const x of items){if(!x.esManual&&(x.producto_id||x.id)&&Number(x.cantidad)>0){db.prepare('INSERT OR IGNORE INTO stock_productos(empresa_id,deposito_id,producto_id,cantidad,stock_minimo,updated_at) VALUES(?,?,?,0,0,CURRENT_TIMESTAMP)').run(e,depositoId,x.producto_id||x.id);db.prepare('UPDATE stock_productos SET cantidad=cantidad-?,updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND deposito_id=? AND producto_id=?').run(Math.abs(Number(x.cantidad)),e,depositoId,x.producto_id||x.id);db.prepare('INSERT INTO stock_movimientos(empresa_id,deposito_id,producto_id,tipo,cantidad,motivo,documento_tipo,documento_id,usuario_id) VALUES(?,?,?,?,?,?,?,?,?)').run(e,depositoId,x.producto_id||x.id,reserveWithdrawal?'SALIDA_REMITO_RESERVA':'SALIDA_VENTA',-Math.abs(Number(x.cantidad)),`${type} POS`,type,sale.lastInsertRowid,uid)}}}
    }
    if(mode==='RESERVA'){
      const branchRes=db.prepare('SELECT deposito_id FROM sucursales WHERE id=? AND empresa_id=?').get(d.sucursal_id||0,e);
      const depositoRes=branchRes?.deposito_id||db.prepare('SELECT id FROM depositos WHERE empresa_id=? AND activo=1 ORDER BY id LIMIT 1').get(e)?.id;
      if(depositoRes){for(const x of items){if(!x.esManual&&(x.producto_id||x.id)&&Number(x.cantidad)>0){db.prepare("INSERT INTO stock_reservas(empresa_id,deposito_id,producto_id,documento_tipo,documento_id,cantidad,estado,observaciones,usuario_id) VALUES(?,?,?,?,?,?,'ACTIVA',?,?)").run(e,depositoRes,x.producto_id||x.id,'RESERVA',doc.lastInsertRowid,Number(x.cantidad),`Reserva ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')}`,uid)}}}
    }
    if(mode==='NORMAL'&&accountSale){
      const client=db.prepare('SELECT * FROM clientes WHERE id=? AND empresa_id=?').get(d.cliente_id,e);
      if(!client)throw Object.assign(new Error('Cliente de cuenta corriente inexistente.'),{status:404});
      const docValue=client.cuit||client.dni||String(client.id);
      registrarMovimientoCC({empresaId:e,clienteId:client.id,clienteDoc:docValue,clienteNombre:client.razon_social,tipo:type,concepto:`${type} ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')}`,debe:total,documentoId:doc.lastInsertRowid,observaciones:d.observaciones||null});
    }
    if(esNota){
      if(asociada?.documento_id){
        db.prepare('INSERT OR IGNORE INTO documento_relaciones(empresa_id,documento_origen_id,documento_destino_id,tipo,observaciones) VALUES(?,?,?,?,?)').run(e,asociada.documento_id,doc.lastInsertRowid,type==='NOTA_CREDITO'?'NC':'ND',`${type} de ${asociada.pv_original}-${asociada.numero_original}`);
      }
      if(accountSale&&d.cliente_id){
        const ccClient=db.prepare('SELECT * FROM clientes WHERE id=? AND empresa_id=?').get(d.cliente_id,e);
        if(ccClient)registrarMovimientoCC({empresaId:e,clienteId:ccClient.id,clienteDoc:ccClient.cuit||ccClient.dni||String(ccClient.id),clienteNombre:ccClient.razon_social,tipo:type,concepto:`${type==='NOTA_CREDITO'?'NC':'ND'} ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')}`,debe:type==='NOTA_DEBITO'?total:0,haber:type==='NOTA_CREDITO'?total:0,documentoId:doc.lastInsertRowid,observaciones:d.observaciones||null});
      }
    }
    if(reserveWithdrawal){
      const update=db.prepare("UPDATE reservas_monto SET saldo=saldo-?,estado=CASE WHEN saldo-?<=0 THEN 'AGOTADA' ELSE 'VIGENTE' END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=? AND cliente_id=? AND estado='VIGENTE' AND saldo>=?").run(total,total,reserve.id,e,d.cliente_id,total);
      if(!update.changes)throw Object.assign(new Error('Saldo de reserva por monto insuficiente o reserva no disponible.'),{status:409});
      db.prepare('INSERT INTO reserva_monto_consumos(reserva_id,documento_tipo,documento_id,importe,detalle,venta_id,punto_venta,numero_remito) VALUES(?,?,?,?,?,?,?,?)').run(reserve.id,'REMITO',doc.lastInsertRowid,total,`Retiro por remito ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')}`,sale.lastInsertRowid,pv,number);
    }
    let origenesAnulados=0;
    if(docOrigen){
      db.prepare(`UPDATE documentos_comerciales SET estado='FACTURADO',updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=? AND estado<>'FACTURADO'`).run(docOrigen.id,e);notifWhatsappDoc(docOrigen.id,'FACTURADO');consumirReservasStock(docOrigen.id,e);
      db.prepare('INSERT OR IGNORE INTO documento_relaciones(empresa_id,documento_origen_id,documento_destino_id,tipo,observaciones) VALUES(?,?,?,?,?)').run(e,docOrigen.id,doc.lastInsertRowid,'FACTURA',`Facturado como ${type} ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')} desde el POS`);
    }
    if(type==='FACTURA'&&fiscal&&Array.isArray(d.origen_ids)){
      const anularVenta=db.prepare("UPDATE ventas_pos SET estado='ANULADO' WHERE id=? AND empresa_id=? AND estado='PENDIENTE' AND tipo IN ('NOTA_PEDIDO','PRESUPUESTO','NOTA_X','REMITO')");
      const facturarDoc=db.prepare("UPDATE documentos_comerciales SET estado='FACTURADO',updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=? AND estado IN ('BORRADOR','CONFIRMADO','ACEPTADO','REMITIDO','ENVIADO')");
      for(const oidRaw of d.origen_ids){const oid=Number(oidRaw);if(!oid)continue;const origen=db.prepare('SELECT documento_id FROM ventas_pos WHERE id=? AND empresa_id=?').get(oid,e);const r=anularVenta.run(oid,e);if(r.changes&&origen?.documento_id){facturarDoc.run(origen.documento_id,e);notifWhatsappDoc(origen.documento_id,'FACTURADO');consumirReservasStock(origen.documento_id,e);db.prepare('INSERT OR IGNORE INTO documento_relaciones(empresa_id,documento_origen_id,documento_destino_id,tipo,observaciones) VALUES(?,?,?,?,?)').run(e,origen.documento_id,doc.lastInsertRowid,'FACTURA',`Facturado como ${type} ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')} desde el POS`)}origenesAnulados+=r.changes}
    }
    const cfgReglasRow=db.prepare('SELECT aplicar_reglas_en FROM empresa_configuraciones WHERE empresa_id=?').get(e);
    let aplicarReglas=['FACTURA','NOTA_X','PRESUPUESTO','NOTA_PEDIDO','REMITO','NOTA_CREDITO','NOTA_DEBITO'];
    if(cfgReglasRow?.aplicar_reglas_en){try{const p=JSON.parse(cfgReglasRow.aplicar_reglas_en);if(Array.isArray(p)&&p.length)aplicarReglas=p}catch(err){}}
    const reglasAplican=aplicarReglas.includes(type);
    let cupones=[];
    if(reglasAplican){
      const sorteos=db.prepare('SELECT id,nombre,coupons FROM reglas_sorteo WHERE empresa_id=? AND activo=1 AND min_amount<=? ORDER BY id').all(e,Number(total||0));
      for(const s of sorteos){
        const proximo=db.prepare('SELECT COALESCE(MAX(numero),0)+1 n FROM cupones_sorteo WHERE empresa_id=? AND regla_id=?').get(e,s.id).n;
        const insC=db.prepare('INSERT INTO cupones_sorteo(empresa_id,regla_id,numero,venta_id,cliente_nombre,fecha_entrega,estado) VALUES(?,?,?,?,?,?,?)');
        for(let k=0;k<Number(s.coupons||1);k++){const num=proximo+k;insC.run(e,s.id,num,sale.lastInsertRowid,d.cliente_nombre||null,nowLocal(),'ENTREGADO');cupones.push({sorteo:s.nombre,numero:num});}
      }
    }
    return {saleId:sale.lastInsertRowid,documentId:doc.lastInsertRowid,pointOfSale:pv,number,type,subtipo:type==='REMITO'?(remitoSub||'X'):null,total,regalos:items.filter(x=>x.promocion).length,sorteo:cupones.length?cupones[0].sorteo:null,cupones,condition:reserveWithdrawal?'RESERVA_MONTO':accountSale?'CUENTA_CORRIENTE':'CONTADO',printFormat,cae:fiscal?.cae||null,caeVencimiento:fiscal?.vencimiento||null,comprobanteLetra:fiscal?.letra||null,comprobanteNombre:fiscal?.nombreComprobante||null,afipEstado:afipEstadoDe(fiscal,fiscalPendiente),fiscalError:fiscalPendiente?.error||null,origenesAnulados};
  });
  res.status(201).json({ok:true,operation:tx()});
}
function listPosOperationItems(req,res){const e=empresaId(req),id=Number(req.params.id);const op=db.prepare('SELECT id FROM ventas_pos WHERE id=? AND empresa_id=?').get(id,e);if(!op)return res.status(404).json({ok:false,error:'Operación no encontrada.'});const items=db.prepare('SELECT id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,subtotal FROM venta_pos_items WHERE venta_id=? ORDER BY id').all(id);res.json({ok:true,items})}
function listPosOperations(req,res){const e=empresaId(req);limpiarNotasVenta(e);const rows=db.prepare(`SELECT v.*,(SELECT SUM(i.costo_unitario*i.cantidad) FROM venta_pos_items i WHERE i.venta_id=v.id) costo_total,c.razon_social cliente,ca.nombre cajero,s.nombre sucursal,vd.nombre vendedor_nombre,d.afip_estado,d.afip_resultado,d.afip_observaciones,d.cae,d.cae_vencimiento,d.comprobante_tipo_afip,d.comprobante_letra,d.subtipo FROM ventas_pos v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN cajeros ca ON ca.id=v.cajero_id LEFT JOIN sucursales s ON s.id=v.sucursal_id LEFT JOIN vendedores vd ON vd.id=v.vendedor_id LEFT JOIN documentos_comerciales d ON d.id=v.documento_id WHERE v.empresa_id=? ORDER BY v.id DESC LIMIT ?`).all(e,Number(req.query.limit||200));res.json({ok:true,operations:rows})}
function listCashSessions(req,res){const e=empresaId(req),pv=Number(req.query.pv||0);const rows=db.prepare(`SELECT cs.*,c.nombre cajero,s.nombre sucursal FROM caja_sesiones cs LEFT JOIN cajeros c ON c.id=cs.cajero_id LEFT JOIN sucursales s ON s.id=cs.sucursal_id WHERE cs.empresa_id=? ${pv?'AND COALESCE(cs.punto_venta,0)=? ':''}ORDER BY cs.id DESC`).all(e,...(pv?[pv]:[]));res.json({ok:true,sessions:rows})}
function listCashSessionMedios(req,res){const e=empresaId(req),id=Number(req.params.id);const rows=db.prepare(`SELECT p.medio,SUM(p.importe) importe,COUNT(DISTINCT v.id) ventas FROM venta_pos_pagos p JOIN ventas_pos v ON v.id=p.venta_id WHERE v.empresa_id=? AND v.caja_sesion_id=? GROUP BY p.medio ORDER BY p.medio`).all(e,id);res.json({ok:true,medios:rows})}
const DEFAULT_COMPROBANTE_CONFIG={FACTURA:{descuenta_stock:1,registra_caja:1,requiere_cliente:0,formato_impresion:'PUNTO_VENTA',numerador_tipo:null},NOTA_X:{descuenta_stock:0,registra_caja:0,requiere_cliente:0,formato_impresion:'PUNTO_VENTA',numerador_tipo:null},NOTA_CREDITO:{descuenta_stock:0,registra_caja:0,requiere_cliente:0,formato_impresion:'PUNTO_VENTA',numerador_tipo:null},NOTA_DEBITO:{descuenta_stock:0,registra_caja:0,requiere_cliente:0,formato_impresion:'PUNTO_VENTA',numerador_tipo:null},PRESUPUESTO:{descuenta_stock:0,registra_caja:0,requiere_cliente:0,formato_impresion:'PUNTO_VENTA',numerador_tipo:null},NOTA_PEDIDO:{descuenta_stock:0,registra_caja:0,requiere_cliente:0,formato_impresion:'PUNTO_VENTA',numerador_tipo:null},REMITO:{descuenta_stock:1,registra_caja:0,requiere_cliente:1,formato_impresion:'PUNTO_VENTA',numerador_tipo:null}};
function comprobanteConfig(e,tipo){const base=DEFAULT_COMPROBANTE_CONFIG[tipo]||{descuenta_stock:0,registra_caja:0,requiere_cliente:0,formato_impresion:'PUNTO_VENTA',numerador_tipo:null};const row=db.prepare('SELECT * FROM config_comprobantes WHERE empresa_id=? AND tipo=?').get(e,tipo);return row?{...base,descuenta_stock:Number(row.descuenta_stock||0),registra_caja:Number(row.registra_caja||0),requiere_cliente:Number(row.requiere_cliente||0),requiere_vendedor:Number(row.requiere_vendedor||0),formato_impresion:row.formato_impresion||'PUNTO_VENTA',numerador_tipo:row.numerador_tipo||null}:base}
function listPosComprobantesConfig(req,res){const e=empresaId(req);const rows=db.prepare('SELECT * FROM config_comprobantes WHERE empresa_id=? ORDER BY tipo').all(e);res.json({ok:true,configs:rows.map(r=>({tipo:r.tipo,descuenta_stock:Number(r.descuenta_stock||0),registra_caja:Number(r.registra_caja||0),requiere_cliente:Number(r.requiere_cliente||0),requiere_vendedor:Number(r.requiere_vendedor||0),pie_pegado:Number(r.pie_pegado??1),formato_impresion:r.formato_impresion||'PUNTO_VENTA',numerador_tipo:r.numerador_tipo||null}))})}
async function whatsappDemoMessage(req,res){
  const e=empresaId(req),nombre=String(req.empresa?.nombre||'').trim();
  const telefono=String(req.body?.telefono||'').trim();
  const mensaje=String(req.body?.mensaje||'').trim();
  const nuevo=req.body?.nuevo===true||req.body?.nuevo===1||req.body?.nuevo==='1';
  if(!telefono)return res.status(400).json({ok:false,error:'Falta el teléfono de WhatsApp.'});
  const WhatsAppClienteFlow=require('../services/whatsappClienteFlow.service');
  const { normalizePhone } = require("../utils/validators");
  const tel=normalizePhone(telefono);
  if(nuevo){
    db.prepare(`UPDATE conversations SET estado='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND telefono=? AND canal='WHATSAPP_CLIENTE' AND estado NOT IN ('COMPLETED','CANCELED')`).run(e,tel);
    return res.json({ok:true,reset:true});
  }
  if(!mensaje)return res.status(400).json({ok:false,error:'El mensaje es obligatorio.'});
  try{
    const r=await WhatsAppClienteFlow.mensajeCliente({empresaId:e,empresaNombre:nombre,telefono,mensaje,nombreDeclarado:String(req.body?.nombre||'').trim()||null,req});
    res.json({ok:true,...r});
  }catch(err){
    res.status(500).json({ok:false,error:'No se pudo procesar el mensaje: '+err.message});
  }
}
module.exports.whatsappDemoMessage=whatsappDemoMessage;

function whatsappResumenNotificaciones(req,res){
  const e=empresaId(req);
  const solicitudes=Number(db.prepare("SELECT COUNT(*) n FROM whatsapp_clientes WHERE empresa_id=? AND estado='PENDIENTE'").get(e)?.n||0);
  const notificaciones=Number(db.prepare("SELECT COUNT(*) n FROM whatsapp_notificaciones WHERE empresa_id=? AND estado='PENDIENTE'").get(e)?.n||0);
  const audios=Number(db.prepare("SELECT COUNT(*) n FROM whatsapp_notificaciones WHERE empresa_id=? AND estado_pedido='AUDIO' AND estado='PENDIENTE'").get(e)?.n||0);
  const pagos=Number(db.prepare("SELECT COUNT(*) n FROM whatsapp_notificaciones WHERE empresa_id=? AND estado_pedido='PAGO_PENDIENTE_VERIFICACION' AND estado='PENDIENTE'").get(e)?.n||0);
  const pedidosNuevos=Number(db.prepare("SELECT COUNT(*) n FROM conversations WHERE empresa_id=? AND estado NOT IN ('COMPLETED','CANCELED') AND moderador IS NULL").get(e)?.n||0);
  res.json({ok:true,solicitudes,notificaciones,audios,pagos,pedidosNuevos,total:solicitudes+notificaciones});
}
module.exports.whatsappResumenNotificaciones=whatsappResumenNotificaciones;

async function whatsappDemoEmpleadoMessage(req,res){
  const e=empresaId(req),nombre=String(req.empresa?.nombre||'').trim();
  const telefono=String(req.body?.telefono||'').trim();
  const mensaje=String(req.body?.mensaje||'').trim();
  const nuevo=req.body?.nuevo===true||req.body?.nuevo===1||req.body?.nuevo==='1';
  if(!telefono)return res.status(400).json({ok:false,error:'Falta el teléfono.'});
  if(nuevo){
    db.prepare(`UPDATE conversations SET estado='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND telefono=? AND canal='WHATSAPP' AND estado NOT IN ('COMPLETED','CANCELED')`).run(e,telefono);
    return res.json({ok:true,reset:true});
  }
  if(!mensaje)return res.status(400).json({ok:false,error:'El mensaje es obligatorio.'});
  try{
    const CommercialConversation=require('../core/commercial-conversation');
    const ResponseService=require('../services/whatsappCommercialResponse.service');
    const canal='WHATSAPP';
    const usuarioId=req.usuario?.id||null;
    let conversation=CommercialConversation.Service.findActive({empresaId:e,telefono,canal});
    let engineResult;
    if(!conversation){
      const context=CommercialConversation.Engine.start({message:mensaje,channel:canal});
      context.telefonoOrigen=telefono;
      conversation=CommercialConversation.Service.create({empresaId:e,telefono,canal,context});
      conversation.context.telefonoOrigen=telefono;
      engineResult=await CommercialConversation.Engine.execute({context:conversation.context,empresaId:e,usuarioId,empresaNombre:nombre});
    }else{
      conversation.context.telefonoOrigen=telefono;
      engineResult=await CommercialConversation.Engine.continue({context:conversation.context,message:mensaje,empresaId:e,usuarioId,empresaNombre:nombre});
    }
    conversation=CommercialConversation.Service.save(conversation);
    res.json(ResponseService.build({req,conversation,engineResult,idempotentReplay:false}));
  }catch(err){
    res.status(500).json({ok:false,error:'No se pudo procesar el mensaje: '+err.message});
  }
}
module.exports.whatsappDemoEmpleadoMessage=whatsappDemoEmpleadoMessage;

function savePosComprobanteConfig(req,res){const e=empresaId(req),tipo=String(req.params.tipo||'').trim().toUpperCase().replace(/\s+/g,'_');if(!tipo)return res.status(400).json({ok:false,error:'Tipo de comprobante inválido.'});const b=req.body||{};db.prepare(`INSERT INTO config_comprobantes(empresa_id,tipo,descuenta_stock,registra_caja,requiere_cliente,requiere_vendedor,formato_impresion,numerador_tipo,pie_pegado,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(empresa_id,tipo) DO UPDATE SET descuenta_stock=excluded.descuenta_stock,registra_caja=excluded.registra_caja,requiere_cliente=excluded.requiere_cliente,requiere_vendedor=excluded.requiere_vendedor,formato_impresion=excluded.formato_impresion,numerador_tipo=excluded.numerador_tipo,pie_pegado=excluded.pie_pegado,updated_at=excluded.updated_at`).run(e,tipo,b.descuenta_stock?1:0,b.registra_caja?1:0,b.requiere_cliente?1:0,b.requiere_vendedor?1:0,b.formato_impresion==='A4'||b.formato_impresion==='80MM'?b.formato_impresion:'PUNTO_VENTA',b.numerador_tipo?String(b.numerador_tipo).trim().toUpperCase():null,b.pie_pegado===false||b.pie_pegado===0?0:1);res.json({ok:true,config:{tipo,descuenta_stock:b.descuenta_stock?1:0,registra_caja:b.registra_caja?1:0,requiere_cliente:b.requiere_cliente?1:0,requiere_vendedor:b.requiere_vendedor?1:0,pie_pegado:b.pie_pegado===false||b.pie_pegado===0?0:1,formato_impresion:b.formato_impresion==='A4'||b.formato_impresion==='80MM'?b.formato_impresion:'PUNTO_VENTA',numerador_tipo:b.numerador_tipo?String(b.numerador_tipo).trim().toUpperCase():null}})}

/*
 * Convierte una nota de pedido pendiente del POS en una factura electrónica:
 * emite el CAE antes de persistir, descuenta stock (el pedido nunca lo movió),
 * registra el cobro en caja (o en cuenta corriente según la condición) y
 * reconvierte la propia operación a FACTURA CONFIRMADA.
 */
async function facturarPedido(req,res){
  const e=empresaId(req),uid=userId(req),id=Number(req.params.id);
  const sale=db.prepare('SELECT * FROM ventas_pos WHERE id=? AND empresa_id=?').get(id,e);
  if(!sale)return res.status(404).json({ok:false,error:'Operación no encontrada.'});
  if(!['NOTA_PEDIDO','PRESUPUESTO','NOTA_X'].includes(sale.tipo))return res.status(400).json({ok:false,error:'Solo presupuestos, notas de venta o notas de pedido pueden facturarse.'});
  if(sale.estado!=='PENDIENTE')return res.status(409).json({ok:false,error:'Solo las operaciones pendientes pueden facturarse.'});
  const items=db.prepare('SELECT * FROM venta_pos_items WHERE venta_id=? ORDER BY id').all(id);
  if(!items.length)return res.status(400).json({ok:false,error:'La nota de pedido no tiene artículos.'});
  const client=db.prepare('SELECT * FROM clientes WHERE id=? AND empresa_id=?').get(sale.cliente_id,e);
  const condicion=String(req.body.condicion_pago||sale.condicion_pago||'CONTADO').toUpperCase();
  const accountSale=['CTA_CTE','CUENTA_CORRIENTE','CUENTA CORRIENTE'].includes(condicion);
  const pv=Number(sale.punto_venta);
  let subtotal=Number(sale.subtotal),total=Number(sale.total),importeIva=Math.max(0,total-subtotal);
  let fiscal=null,fiscalPendiente=null,number;
  try{
    fiscal=await emitirFacturaAfip({empresaId:e,puntoVenta:pv,clienteId:sale.cliente_id,clienteNombre:client?.razon_social||sale.cliente||'CONSUMIDOR FINAL',items,ventaId:id});
  }catch(error){
    if(error instanceof FiscalNetworkError){fiscalPendiente={error:error.message,intentoId:error.intentoId};}
    else return res.status(422).json({ok:false,error:error.message||'No se pudo emitir la factura electrónica.'});
  }
  if(!fiscalPendiente&&!fiscal.ok)return res.status(422).json({ok:false,error:'AFIP rechazó el comprobante. La nota de pedido no se facturó.',detalle:fiscal.observaciones||fiscal.errores||fiscal.resultado||null});
  if(fiscal&&fiscal.ok){
    number=fiscal.numero;
    subtotal=fiscal.importeNeto;
    importeIva=fiscal.importeIva;
    total=fiscal.importeTotal;
  }else{
    number=nextNumber(e,pv,'FACTURA');
  }
  const prevPagos=db.prepare('SELECT medio,importe FROM venta_pos_pagos WHERE venta_id=?').all(id);
  let pagosObj={...Object.fromEntries(prevPagos.map(p=>[String(p.medio).toLowerCase(),Number(p.importe)]))};
  if(accountSale){pagosObj={}}
  else if(req.body.pagos&&typeof req.body.pagos==='object'&&Object.keys(req.body.pagos).length){pagosObj={...req.body.pagos}}
  else if(!Object.keys(pagosObj).length){pagosObj={EFECTIVO:total}}
  const cfgFactura=comprobanteConfig(e,'FACTURA');
  const result=db.transaction(()=>{
    if(fiscal){
      db.prepare('INSERT INTO pos_numeradores(empresa_id,punto_venta,tipo,ultimo_numero) VALUES(?,?,?,?) ON CONFLICT(empresa_id,punto_venta,tipo) DO UPDATE SET ultimo_numero=excluded.ultimo_numero WHERE excluded.ultimo_numero>ultimo_numero').run(e,pv,'FACTURA',number);
    }
    const docOrigenPed = sale.documento_id?db.prepare('SELECT id,tipo,punto_venta,numero,estado FROM documentos_comerciales WHERE id=? AND empresa_id=?').get(sale.documento_id,e):null;
    const doc=db.prepare(`INSERT INTO documentos_comerciales(empresa_id,cliente_id,vendedor_id,tipo,estado,punto_venta,numero,fecha,condicion_venta,observaciones,importe_neto,importe_iva,importe_total,importe_bruto,descuento_general,descuento_importe,canal,cae,cae_vencimiento,comprobante_tipo_afip,comprobante_letra,afip_resultado,afip_observaciones,afip_estado,documento_origen_id,documento_origen_tipo,documento_origen_punto_venta,documento_origen_numero) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e,sale.cliente_id||null,sale.vendedor_id||null,'FACTURA','CONFIRMADO',pv,number,nowLocal(),condicion,sale.observaciones||'',subtotal,importeIva,total,brutoYDescuento(subtotal,sale.descuento_general).bruto,Number(sale.descuento_general||0),brutoYDescuento(subtotal,sale.descuento_general).descuento,'POS',fiscal?.cae||null,fiscal?.vencimiento||null,fiscal?.tipoComprobante||null,fiscal?.letra||null,fiscal?.resultado||(fiscalPendiente?'PENDIENTE':null),afipObservacionesDe(fiscal,fiscalPendiente),afipEstadoDe(fiscal,fiscalPendiente),docOrigenPed?.id||null,docOrigenPed?.tipo||null,docOrigenPed?.punto_venta||null,docOrigenPed?.numero||null);
    const insDoc=db.prepare('INSERT INTO documento_items(documento_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    const empresaFiscalPed=db.prepare('SELECT condicion_iva FROM empresas WHERE id=?').get(e);
    const discriminaIvaPed=String(empresaFiscalPed?.condicion_iva||'').toUpperCase()==='RESPONSABLE INSCRIPTO';
    for(const x of items){const netoLine=Number(x.precio_unitario||0)*Number(x.cantidad||0)*(1-Number(x.descuento||0)/100);const ivaPorc=Number(x.iva||21);const netoFiscal=discriminaIvaPed?netoLine:(ivaPorc>0?Math.round(netoLine*(1+ivaPorc/100)*100)/100:netoLine);const ivaLine=discriminaIvaPed?Math.round(netoLine*ivaPorc/100*100)/100:0;insDoc.run(doc.lastInsertRowid,x.producto_id||null,x.codigo||'',x.descripcion,x.unidad||'UN',Number(x.cantidad),Number(x.precio_unitario||0),Number(x.descuento||0),ivaPorc,Math.round(netoFiscal*100)/100,ivaLine,Math.round((netoFiscal+ivaLine)*100)/100)}
    const session=accountSale?null:openOrGetCashSession(e,{sucursal_id:sale.sucursal_id,cajero_id:sale.cajero_id},uid);
    const pvPrintFact=db.prepare('SELECT formato_impresion FROM puntos_venta WHERE empresa_id=? AND numero=?').get(e,pv)?.formato_impresion||'A4';
    const printFormat=cfgFactura.formato_impresion!=='PUNTO_VENTA'?cfgFactura.formato_impresion:pvPrintFact;
    db.prepare(`UPDATE ventas_pos SET tipo='FACTURA',estado='CONFIRMADA',punto_venta=?,numero=?,condicion_pago=?,caja_sesion_id=?,documento_id=?,subtotal=?,total=?,vuelto=0,observaciones=?,formato_impresion=? WHERE id=?`).run(pv,number,condicion,session?.id||null,doc.lastInsertRowid,subtotal,total,sale.observaciones?`${sale.observaciones} (facturado desde nota de pedido)`:null,printFormat,id);
    if(sale.vendedor_id){const vendedor=db.prepare('SELECT comision_porcentaje FROM vendedores WHERE id=? AND empresa_id=?').get(sale.vendedor_id,e);if(vendedor&&Number(vendedor.comision_porcentaje||0)>0)registrarComision({empresaId:e,vendedorId:sale.vendedor_id,origenTipo:'FACTURA',origenId:id,clienteDoc:client?.cuit||client?.dni||'0',clienteNombre:client?.razon_social||sale.cliente||'CONSUMIDOR FINAL',baseCalculo:total,porcentaje:Number(vendedor.comision_porcentaje),observaciones:`Comisión por FACTURA ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')} POS (facturado desde ${sale.tipo})`})}
if(docOrigenPed){
      db.prepare(`UPDATE documentos_comerciales SET estado='FACTURADO',updated_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=? AND estado<>'FACTURADO'`).run(docOrigenPed.id,e);notifWhatsappDoc(docOrigenPed.id,'FACTURADO');consumirReservasStock(docOrigenPed.id,e);
      db.prepare('INSERT OR IGNORE INTO documento_relaciones(empresa_id,documento_origen_id,documento_destino_id,tipo,observaciones) VALUES(?,?,?,?,?)').run(e,docOrigenPed.id,doc.lastInsertRowid,'FACTURA',`Facturado como FACTURA ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')} desde el POS`);
    }
    if(fiscal?.intentoId||fiscalPendiente?.intentoId){db.prepare('UPDATE fiscal_intentos SET venta_id=?,documento_id=? WHERE id=?').run(id,doc.lastInsertRowid,Number(fiscal?.intentoId||fiscalPendiente?.intentoId))}
    db.prepare('DELETE FROM venta_pos_pagos WHERE venta_id=?').run(id);
    const pay=db.prepare('INSERT INTO venta_pos_pagos(venta_id,medio,importe,detalle_json) VALUES(?,?,?,?)');
    for(const [medio,importeRaw] of Object.entries(pagosObj)){const importe=Number(importeRaw||0);if(importe>0)pay.run(id,String(medio).toUpperCase(),importe,null)}
    const transferenciaPed=Number(pagosObj.TRANSFERENCIA||pagosObj.transferencia||0);
    if(transferenciaPed>0)registrarTransferenciaBancaria(e,{bancoId:req.body.banco_id_transferencia,concepto:`FACTURA ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')} TRANSFERENCIA`,importe:transferenciaPed,origenTipo:'VENTA_TRANSFERENCIA',origenId:id});
    if(!accountSale && cfgFactura.registra_caja){
      db.prepare('INSERT INTO caja_movimientos(empresa_id,tipo,concepto,importe,medios_json,cliente_nombre,caja_sesion_id,sucursal_id,cajero_id,venta_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(e,'VENTA',`FACTURA ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')}`,total,JSON.stringify(pagosObj),client?.razon_social||'CONSUMIDOR FINAL',session.id,sale.sucursal_id||null,sale.cajero_id||null,id);
      db.prepare('UPDATE caja_sesiones SET saldo_teorico=saldo_teorico+? WHERE id=?').run(total,session.id);
    }
    const branch=db.prepare('SELECT deposito_id FROM sucursales WHERE id=? AND empresa_id=?').get(sale.sucursal_id||0,e);
    const depositoId=branch?.deposito_id||db.prepare('SELECT id FROM depositos WHERE empresa_id=? AND activo=1 ORDER BY id LIMIT 1').get(e)?.id;
    if(depositoId){for(const x of items){if((x.producto_id)&&Number(x.cantidad)>0){db.prepare('INSERT OR IGNORE INTO stock_productos(empresa_id,deposito_id,producto_id,cantidad,stock_minimo,updated_at) VALUES(?,?,?,0,0,CURRENT_TIMESTAMP)').run(e,depositoId,x.producto_id);db.prepare('UPDATE stock_productos SET cantidad=cantidad-?,updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND deposito_id=? AND producto_id=?').run(Math.abs(Number(x.cantidad)),e,depositoId,x.producto_id);db.prepare('INSERT INTO stock_movimientos(empresa_id,deposito_id,producto_id,tipo,cantidad,motivo,documento_tipo,documento_id,usuario_id) VALUES(?,?,?,?,?,?,?,?,?)').run(e,depositoId,x.producto_id,'SALIDA_VENTA',-Math.abs(Number(x.cantidad)),`FACTURA ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')} POS`,'FACTURA',doc.lastInsertRowid,uid)}}}
    if(accountSale&&sale.cliente_id){
      const movCC=db.prepare('SELECT * FROM clientes WHERE id=? AND empresa_id=?').get(sale.cliente_id,e);
      if(movCC)registrarMovimientoCC({empresaId:e,clienteId:movCC.id,clienteDoc:movCC.cuit||movCC.dni||String(movCC.id),clienteNombre:movCC.razon_social,tipo:'FACTURA',concepto:`FACTURA ${String(pv).padStart(4,'0')}-${String(number).padStart(8,'0')}`,debe:total,documentoId:doc.lastInsertRowid,observaciones:sale.observaciones||null});
    }
    return {saleId:id,documentId:doc.lastInsertRowid,pointOfSale:pv,number,type:'FACTURA',total,condition:accountSale?'CUENTA_CORRIENTE':'CONTADO',printFormat,cae:fiscal?.cae||null,caeVencimiento:fiscal?.vencimiento||null,comprobanteLetra:fiscal?.letra||null,comprobanteNombre:fiscal?.nombreComprobante||null,afipEstado:afipEstadoDe(fiscal,fiscalPendiente),fiscalError:fiscalPendiente?.error||null};
  });
  res.status(201).json({ok:true,operation:result()});
}

function anularOperacion(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const sale=db.prepare('SELECT * FROM ventas_pos WHERE id=? AND empresa_id=?').get(id,e);
  if(!sale)return res.status(404).json({ok:false,error:'Operación no encontrada.'});
  if(sale.estado!=='PENDIENTE')return res.status(409).json({ok:false,error:'Solo las operaciones pendientes pueden anularse.'});
  db.prepare(`UPDATE ventas_pos SET estado='ANULADO' WHERE id=? AND empresa_id=?`).run(id,e);
  if(sale.documento_id)db.prepare(`UPDATE documentos_comerciales SET estado='ANULADO',fecha_anulacion=COALESCE(fecha_anulacion,CURRENT_TIMESTAMP) WHERE id=? AND empresa_id=? AND estado='BORRADOR'`).run(sale.documento_id,e);
  res.json({ok:true,operation:{saleId:id,type:sale.tipo,estado:'ANULADO'}});
}

/*
 * Reintenta la emisión del CAE de una factura que quedó PENDIENTE porque
 * ARCA no respondió. Usa los items y el cliente ya registrados, sin volver
 * a mover stock ni caja: solo actualiza el documento con el CAE autorizado.
 */
async function retryFiscalCae(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const sale=db.prepare(`SELECT v.*,d.id documento_id,d.cae cae_doc FROM ventas_pos v JOIN documentos_comerciales d ON d.id=v.documento_id WHERE v.id=? AND v.empresa_id=?`).get(id,e);
  if(!sale)return res.status(404).json({ok:false,error:'Operación no encontrada.'});
  if(sale.tipo!=='FACTURA')return res.status(400).json({ok:false,error:'Solo las facturas electrónicas admiten reintento de CAE.'});
  if(sale.cae_doc)return res.status(409).json({ok:false,error:'Esta factura ya tiene CAE autorizado.'});
  const items=db.prepare('SELECT * FROM venta_pos_items WHERE venta_id=? ORDER BY id').all(id);
  const client=db.prepare('SELECT * FROM clientes WHERE id=? AND empresa_id=?').get(sale.cliente_id,e);
  let fiscal;
  try{
    fiscal=await emitirFacturaAfip({empresaId:e,puntoVenta:sale.punto_venta,clienteId:sale.cliente_id,clienteNombre:sale.cliente||client?.razon_social||'CONSUMIDOR FINAL',items,ventaId:id,documentoId:sale.documento_id});
  }catch(error){
    if(error instanceof FiscalNetworkError)return res.status(503).json({ok:false,error:error.message,afipEstado:'PENDIENTE'});
    return res.status(422).json({ok:false,error:error.message||'No se pudo reintentar el CAE.'});
  }
  if(!fiscal.ok){
    db.prepare(`UPDATE documentos_comerciales SET afip_estado='RECHAZADO',afip_resultado=?,afip_observaciones=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(fiscal.resultado,afipObservacionesDe(fiscal,null),sale.documento_id);
    return res.status(422).json({ok:false,error:'AFIP rechazó el comprobante en el reintento.',detalle:fiscal.observaciones||fiscal.errores||fiscal.resultado||null,afipEstado:'RECHAZADO'});
  }
  const tx=db.transaction(()=>{
    db.prepare(`UPDATE documentos_comerciales SET numero=?,cae=?,cae_vencimiento=?,comprobante_tipo_afip=?,comprobante_letra=?,afip_resultado=?,afip_observaciones=?,afip_estado='AUTORIZADO',importe_neto=?,importe_iva=?,importe_total=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(fiscal.numero,fiscal.cae,fiscal.vencimiento,fiscal.tipoComprobante,fiscal.letra,fiscal.resultado,afipObservacionesDe(fiscal,null),fiscal.importeNeto,fiscal.importeIva,fiscal.importeTotal,sale.documento_id);
    db.prepare('UPDATE ventas_pos SET numero=?,subtotal=?,total=? WHERE id=?').run(fiscal.numero,fiscal.importeNeto,fiscal.importeTotal,id);
    db.prepare('INSERT INTO pos_numeradores(empresa_id,punto_venta,tipo,ultimo_numero) VALUES(?,?,?,?) ON CONFLICT(empresa_id,punto_venta,tipo) DO UPDATE SET ultimo_numero=excluded.ultimo_numero WHERE excluded.ultimo_numero>ultimo_numero').run(e,sale.punto_venta,'FACTURA',fiscal.numero);
  });
  tx();
  res.json({ok:true,operation:{saleId:id,documentId:sale.documento_id,pointOfSale:sale.punto_venta,number:fiscal.numero,type:'FACTURA',total:fiscal.importeTotal,cae:fiscal.cae,caeVencimiento:fiscal.vencimiento,comprobanteLetra:fiscal.letra,comprobanteNombre:fiscal.nombreComprobante,afipEstado:'AUTORIZADO'}});
}

/*
 * Emite una nota de crédito (NC) o nota de débito (ND) electrónica contra
 * una factura del POS ya autorizada. No mueve stock ni caja; si la factura
 * original fue cuenta corriente, revierte (NC) o suma (ND) el importe en la
 * cuenta del cliente. Devuelve el documento nuevo con su CAE.
 */
function cargarVentaConDocumento(e,id){
  return db.prepare(`SELECT v.*,d.id documento_id,d.cae cae_original,d.punto_venta pv_original,d.numero numero_original,d.comprobante_tipo_afip tipo_afip_original FROM ventas_pos v JOIN documentos_comerciales d ON d.id=v.documento_id WHERE v.id=? AND v.empresa_id=?`).get(id,e);
}
function insertarDocumentoNota({e,d,sale,items,pv,number,tipo,subtotal,importeIva,total,fiscal}){
  const doc=db.prepare(`INSERT INTO documentos_comerciales(empresa_id,cliente_id,vendedor_id,tipo,estado,punto_venta,numero,fecha,condicion_venta,observaciones,importe_neto,importe_iva,importe_total,importe_bruto,descuento_general,descuento_importe,canal,cae,cae_vencimiento,comprobante_tipo_afip,comprobante_letra,afip_resultado,afip_observaciones,afip_estado) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e,d.cliente_id||sale.cliente_id||null,d.vendedor_id||sale.vendedor_id||null,tipo,'CONFIRMADO',pv,number,nowLocal(),sale.condicion_pago||'CONTADO',d.observaciones||'',subtotal,importeIva,total,subtotal,0,0,'POS',fiscal?.cae||null,fiscal?.vencimiento||null,fiscal?.tipoComprobante||null,fiscal?.letra||null,fiscal?.resultado||null,fiscal?.observaciones?JSON.stringify(fiscal.observaciones):null,'AUTORIZADO');
  const insItem=db.prepare('INSERT INTO documento_items(documento_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const x of items){const line=Number(x.precio_unitario||x.precio||0)*Number(x.cantidad||0)*(1-Number(x.descuento||0)/100);insItem.run(doc.lastInsertRowid,x.producto_id||x.id||null,x.codigo||'',x.descripcion,x.unidad||'UN',Number(x.cantidad),Number(x.precio_unitario||x.precio||0),Number(x.descuento||0),Number(x.iva||21),line,0,line)}
  if(doc.lastInsertRowid&&sale.documento_id){
    db.prepare('INSERT OR IGNORE INTO documento_relaciones(empresa_id,documento_origen_id,documento_destino_id,tipo,observaciones) VALUES(?,?,?,?,?)').run(e,sale.documento_id,doc.lastInsertRowid,tipo==='NOTA_CREDITO'?'NC':'ND',`${tipo} de ${sale.pv_original}-${sale.numero_original}`);
  }
  return doc.lastInsertRowid;
}
async function emitirNota(req,res,notaTipo){
  const e=empresaId(req),id=Number(req.params.id),d=req.body||{};
  const sale=cargarVentaConDocumento(e,id);
  if(!sale)return res.status(404).json({ok:false,error:'Operación no encontrada.'});
  if(sale.tipo!=='FACTURA'||!sale.cae_original)return res.status(400).json({ok:false,error:'Solo las facturas electrónicas autorizadas admiten notas.'});
  const items=db.prepare('SELECT * FROM venta_pos_items WHERE venta_id=? ORDER BY id').all(id);
  const client=db.prepare('SELECT * FROM clientes WHERE id=? AND empresa_id=?').get(sale.cliente_id,e);
  const operacion=notaTipo==='NOTA_CREDITO'?'NOTA_CREDITO':'NOTA_DEBITO';
  let fiscal;
  try{
    fiscal=await emitirFacturaAfip({
      empresaId:e,puntoVenta:sale.pv_original,clienteId:sale.cliente_id,clienteNombre:sale.cliente||client?.razon_social||'CONSUMIDOR FINAL',
      items,operacion,cbteAsoc:[{tipo:sale.tipo_afip_original,puntoVenta:sale.pv_original,numero:sale.numero_original}],
      ventaId:id,documentoId:sale.documento_id,
    });
  }catch(error){
    if(error instanceof FiscalNetworkError)return res.status(503).json({ok:false,error:error.message,afipEstado:'PENDIENTE'});
    return res.status(422).json({ok:false,error:error.message||`No se pudo emitir la ${notaTipo==='NOTA_CREDITO'?'nota de crédito':'nota de débito'}.`});
  }
  if(!fiscal.ok)return res.status(422).json({ok:false,error:'AFIP rechazó la nota.',detalle:fiscal.observaciones||fiscal.errores||fiscal.resultado||null});
  const tx=db.transaction(()=>{
    const documentoId=insertarDocumentoNota({e,d,sale,items,pv:sale.pv_original,number:fiscal.numero,tipo:notaTipo,subtotal:fiscal.importeNeto,importeIva:fiscal.importeIva,total:fiscal.importeTotal,fiscal});
    if(sale.condicion_pago&&['CTA_CTE','CUENTA_CORRIENTE','CUENTA CORRIENTE'].includes(String(sale.condicion_pago).toUpperCase())&&client){
      registrarMovimientoCC({empresaId:e,clienteId:client.id,clienteDoc:client.cuit||client.dni||String(client.id),clienteNombre:client.razon_social,tipo:notaTipo,concepto:`${notaTipo==='NOTA_CREDITO'?'NC':'ND'} ${String(sale.pv_original).padStart(4,'0')}-${String(fiscal.numero).padStart(8,'0')}`,debe:notaTipo==='NOTA_DEBITO'?fiscal.importeTotal:0,haber:notaTipo==='NOTA_CREDITO'?fiscal.importeTotal:0,documentoId});
    }
    return documentoId;
  });
  const documentoId=tx();
  res.status(201).json({ok:true,nota:{documentId:documentoId,pointOfSale:sale.pv_original,number:fiscal.numero,tipo:notaTipo,total:fiscal.importeTotal,cae:fiscal.cae,caeVencimiento:fiscal.vencimiento,comprobanteLetra:fiscal.letra,comprobanteNombre:fiscal.nombreComprobante,afipEstado:'AUTORIZADO'}});
}
function emitirNotaCredito(req,res){return emitirNota(req,res,'NOTA_CREDITO')}
function emitirNotaDebito(req,res){return emitirNota(req,res,'NOTA_DEBITO')}

function registrarTransferenciaBancaria(e,{bancoId,fecha,concepto,importe,origenTipo,origenId}){
  const id=Number(bancoId||0);
  const monto=Math.abs(Number(importe||0));
  if(!id||!monto)return null;
  const banco=db.prepare('SELECT id FROM bancos WHERE id=? AND empresa_id=? AND activo=1').get(id,e);
  if(!banco)return null;
  return db.prepare('INSERT INTO banco_movimientos(empresa_id,banco_id,fecha,tipo,concepto,importe,origen_tipo,origen_id,conciliado) VALUES(?,?,?,?,?,?,?,?,0)').run(e,id,fecha||nowLocal().slice(0,10),'CREDITO',concepto,monto,origenTipo||'VENTA_TRANSFERENCIA',origenId||null);
}
function listCardCollections(req,res){
  const e=empresaId(req);
  const pos=db.prepare(`SELECT p.id,COALESCE(v.fecha,v.created_at) fecha,v.tipo,v.punto_venta,v.numero,p.importe,v.estado,c.razon_social cliente,p.detalle_json FROM venta_pos_pagos p JOIN ventas_pos v ON v.id=p.venta_id LEFT JOIN clientes c ON c.id=v.cliente_id WHERE v.empresa_id=? AND p.medio='TARJETA' AND v.estado!='ANULADO' ORDER BY p.id DESC LIMIT 300`).all(e);
  const recibos=db.prepare(`SELECT r.id,COALESCE(r.created_at,r.fecha) fecha,r.punto_venta,r.numero,d.importe,r.estado,r.cliente_nombre cliente,d.tarjeta,d.cuotas,d.lote,d.cupon,d.autorizacion FROM recibo_detalles d JOIN recibos r ON r.id=d.recibo_id WHERE r.empresa_id=? AND d.medio_pago='TARJETA' ORDER BY r.id DESC LIMIT 300`).all(e);
  const rows=[
    ...pos.map(p=>{let det=null;try{det=p.detalle_json?JSON.parse(p.detalle_json):null}catch{det=null}return{id:`p${p.id}`,fecha:p.fecha,origen:'POS',tarjeta:det?.tarjeta||'TARJETA',comprobante:`${p.tipo} ${String(p.punto_venta).padStart(4,'0')}-${String(p.numero).padStart(8,'0')}`,cliente:p.cliente||'CONSUMIDOR FINAL',importe:Number(p.importe),estado:p.estado==='CONFIRMADA'?'CONFIRMADO':p.estado||'PENDIENTE',cuotas:det?.cuotas||null,lote:det?.lote||null,cupon:det?.cupon||null,autorizacion:det?.autorizacion||null}}),
    ...recibos.map(r=>({id:`r${r.id}`,fecha:r.fecha,origen:'RECIBO',tarjeta:r.tarjeta||'TARJETA',comprobante:`RECIBO ${String(r.punto_venta).padStart(4,'0')}-${String(r.numero).padStart(8,'0')}`,cliente:r.cliente||'—',importe:Number(r.importe),estado:r.estado||'CONFIRMADO',cuotas:r.cuotas||null,lote:r.lote||null,cupon:r.cupon||null,autorizacion:r.autorizacion||null})),
  ].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  res.json({ok:true,cobros:rows});
}
function reporteProductos(req,res){
  const e=empresaId(req),from=String(req.query.from||'').slice(0,10)||'2000-01-01',to=String(req.query.to||'').slice(0,10)||'2999-12-31';
  const rows=db.prepare(`SELECT COALESCE(i.producto_id,0) producto_id,COALESCE(NULLIF(i.codigo,''),'(varios)') codigo,i.descripcion,SUM(i.cantidad) cantidad,ROUND(SUM(i.subtotal),2) importe,ROUND(SUM(i.costo_unitario*i.cantidad),2) costo,COUNT(DISTINCT v.id) ventas FROM venta_pos_items i JOIN ventas_pos v ON v.id=i.venta_id WHERE v.empresa_id=? AND v.estado='CONFIRMADA' AND date(COALESCE(v.fecha,v.created_at)) BETWEEN ? AND ? GROUP BY i.producto_id,i.codigo,i.descripcion ORDER BY importe DESC`).all(e,from,to);
  const totales=db.prepare(`SELECT COALESCE(SUM(i.subtotal),0) importe,COALESCE(SUM(i.costo_unitario*i.cantidad),0) costo,COALESCE(SUM(i.cantidad),0) unidades FROM venta_pos_items i JOIN ventas_pos v ON v.id=i.venta_id WHERE v.empresa_id=? AND v.estado='CONFIRMADA' AND date(COALESCE(v.fecha,v.created_at)) BETWEEN ? AND ?`).get(e,from,to);
  res.json({ok:true,productos:rows,totales:{importe:Number(totales.importe||0),costo:Number(totales.costo||0),unidades:Number(totales.unidades||0)}});
}
function bankReconciliation(req,res){
  const e=empresaId(req);
  const banks=db.prepare('SELECT id,nombre,cuenta,cbu,alias,saldo_inicial FROM bancos WHERE empresa_id=? AND activo=1 ORDER BY nombre').all(e);
  const bancos=banks.map(b=>{
    const movs=db.prepare('SELECT id,fecha,tipo,concepto,importe,conciliado,fecha_conciliacion,origen_tipo,origen_id FROM banco_movimientos WHERE banco_id=? ORDER BY fecha,id').all(b.id).map(m=>({...m,importe:Number(m.importe),conciliado:!!m.conciliado}));
    const pend=db.prepare("SELECT id,fecha,total importe,estado FROM cheque_depositos WHERE banco_id=? AND estado='PENDIENTE_CONCILIACION' ORDER BY id").all(b.id).map(x=>({...x,concepto:`DEPÓSITO DE CHEQUES #${x.id} (pendiente de conciliar)`,tipo:'CREDITO',conciliado:false,origen_tipo:'DEPOSITO_CHEQUES',origen_id:x.id}));
    const creditos=movs.filter(m=>m.tipo==='CREDITO').reduce((n,m)=>n+m.importe,0)+pend.reduce((n,x)=>n+x.importe,0);
    const debitos=movs.filter(m=>m.tipo==='DEBITO').reduce((n,m)=>n+m.importe,0);
    const saldoInicial=Number(b.saldo_inicial||0);
    return {id:b.id,nombre:b.nombre,cuenta:b.cuenta,cbu:b.cbu,alias:b.alias,saldoInicial,creditos,debitos,pendientesDepositos:pend.reduce((n,x)=>n+x.importe,0),saldo:saldoInicial+creditos-debitos,movimientos:[...movs,...pend].sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)))};
  });
  res.json({ok:true,bancos});
}
function rankingVentas(req,res){
  const e=empresaId(req);
  const valida=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
  const desde=valida(req.query.desde)?req.query.desde:null,hasta=valida(req.query.hasta)?req.query.hasta:null;
  const rango=desde||hasta?' AND date(COALESCE(v.fecha,v.created_at)) BETWEEN ? AND ? ':'';
  const params=desde||hasta?[e,desde||'2000-01-01',hasta||'2999-12-31']:[e];
  const vendedores=db.prepare(`SELECT COALESCE(NULLIF(vd.nombre,''),'SIN VENDEDOR') nombre,COUNT(*) ventas,ROUND(SUM(v.total),2) total FROM ventas_pos v LEFT JOIN vendedores vd ON vd.id=v.vendedor_id WHERE v.empresa_id=? AND v.estado='CONFIRMADA'${rango}GROUP BY COALESCE(NULLIF(vd.nombre,''),'SIN VENDEDOR') ORDER BY total DESC`).all(...params).map(x=>({...x,ventas:Number(x.ventas),total:Number(x.total)}));
  const cajeros=db.prepare(`SELECT COALESCE(NULLIF(ca.nombre,''),'SIN CAJERO') nombre,COUNT(*) ventas,ROUND(SUM(v.total),2) total FROM ventas_pos v LEFT JOIN cajeros ca ON ca.id=v.cajero_id WHERE v.empresa_id=? AND v.estado='CONFIRMADA'${rango}GROUP BY COALESCE(NULLIF(ca.nombre,''),'SIN CAJERO') ORDER BY total DESC`).all(...params).map(x=>({...x,ventas:Number(x.ventas),total:Number(x.total)}));
  res.json({ok:true,vendedores,cajeros});
}

/*
 * Motor de reportes de ventas. Devuelve los comprobantes (con sus ítems)
 * filtrados contra la base para que el frontend agrupe por vendedor,
 * cliente o producto. Filtros: desde, hasta, tipos (csv), estado,
 * vendedor_id, cliente_id, producto_id, codigo.
 */
function reporteVentas(req,res){
  const e=empresaId(req);
  const desde=String(req.query.desde||'').slice(0,10)||'2000-01-01';
  const hasta=String(req.query.hasta||'').slice(0,10)||'2999-12-31';
  const tipos=(req.query.tipos||'').split(',').map(s=>s.trim()).filter(Boolean);
  const estado=String(req.query.estado||'').trim();
  const vendedorId=Number(req.query.vendedor_id||0)||null;
  const clienteId=Number(req.query.cliente_id||0)||null;
  const productoId=Number(req.query.producto_id||0)||null;
  const codigo=String(req.query.codigo||'').trim();
  const conds=['d.empresa_id=?'];
  const params=[e];
  conds.push('date(COALESCE(d.fecha,d.created_at)) BETWEEN ? AND ?');
  params.push(desde,hasta);
  if(tipos.length){conds.push(`d.tipo IN (${tipos.map(()=>'?').join(',')})`);params.push(...tipos);}
  if(estado){conds.push('d.estado=?');params.push(estado);}
  if(vendedorId){conds.push('d.vendedor_id=?');params.push(vendedorId);}
  if(clienteId){conds.push('d.cliente_id=?');params.push(clienteId);}
  if(productoId||codigo){
    const sub=['SELECT 1 FROM documento_items it WHERE it.documento_id=d.id'];
    if(productoId)sub.push('it.producto_id=?');
    if(codigo)sub.push('it.codigo=?');
    conds.push(`EXISTS (${sub.join(' AND ')})`);
    if(productoId)params.push(productoId);
    if(codigo)params.push(codigo);
  }
  const docs=db.prepare(`SELECT d.id,d.fecha,d.fecha_anulacion,d.tipo,d.estado,d.punto_venta,d.numero,d.condicion_venta,d.importe_total,d.canal,COALESCE(cl.razon_social,'CONSUMIDOR FINAL') cliente_nombre,cl.id cliente_id,cl.domicilio cliente_direccion,COALESCE(vd.nombre,'-') vendedor_nombre FROM documentos_comerciales d LEFT JOIN clientes cl ON cl.id=d.cliente_id LEFT JOIN vendedores vd ON vd.id=d.vendedor_id WHERE ${conds.join(' AND ')} ORDER BY d.fecha DESC,d.id DESC`).all(...params);
  let items=[];
  if(docs.length){
    const ph=docs.map(()=>'?').join(',');
    items=db.prepare(`SELECT documento_id,producto_id,codigo,descripcion,unidad,cantidad,precio_unitario,descuento,iva,subtotal,iva_importe,total FROM documento_items WHERE documento_id IN (${ph})`).all(...docs.map(d=>d.id));
  }
  const porDoc={};
  for(const it of items){const k=it.documento_id;(porDoc[k]=porDoc[k]||[]).push(it);}
  const rows=docs.map(d=>({...d,importe_total:Number(d.importe_total||0),items:porDoc[d.id]||[]}));
  res.json({ok:true,documentos:rows});
}
module.exports.listCardCollections=listCardCollections;
module.exports.reporteProductos=reporteProductos;
module.exports.bankReconciliation=bankReconciliation;
module.exports.rankingVentas=rankingVentas;
module.exports.reporteVentas=reporteVentas;
module.exports.listPosCatalogs=listPosCatalogs;
module.exports.misPuntosVenta=misPuntosVenta;
module.exports.subirLogoPos=subirLogoPos;
module.exports.createPosOperation=createPosOperation;
module.exports.listPosOperationItems=listPosOperationItems;
module.exports.listPosOperations=listPosOperations;
module.exports.listCashSessions=listCashSessions;
module.exports.listCashSessionMedios=listCashSessionMedios;
module.exports.listPosComprobantesConfig=listPosComprobantesConfig;
module.exports.savePosComprobanteConfig=savePosComprobanteConfig;
module.exports.retryFiscalCae=retryFiscalCae;
module.exports.facturarPedido=facturarPedido;
module.exports.anularOperacion=anularOperacion;
module.exports.emitirNotaCredito=emitirNotaCredito;
module.exports.emitirNotaDebito=emitirNotaDebito;
function closeCashSession(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const s=db.prepare("SELECT * FROM caja_sesiones WHERE id=? AND empresa_id=? AND estado='ABIERTA'").get(id,e);
  if(!s)return res.status(404).json({ok:false,error:'La caja no existe o ya está cerrada.'});
  db.prepare("UPDATE caja_sesiones SET estado='CERRADA',fecha_cierre=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?").run(id,e);
  res.json({ok:true,session:db.prepare('SELECT * FROM caja_sesiones WHERE id=?').get(id)});
}
function cashSessionDetail(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const session=db.prepare(`SELECT cs.*,c.nombre cajero,s.nombre sucursal FROM caja_sesiones cs LEFT JOIN cajeros c ON c.id=cs.cajero_id LEFT JOIN sucursales s ON s.id=cs.sucursal_id WHERE cs.id=? AND cs.empresa_id=?`).get(id,e);
  if(!session)return res.status(404).json({ok:false,error:'Caja no encontrada.'});
  const movements=db.prepare('SELECT * FROM caja_movimientos WHERE empresa_id=? AND caja_sesion_id=? ORDER BY id').all(e,id).map(x=>({...x,medios:JSON.parse(x.medios_json||'{}')}));
  const payments=db.prepare(`SELECT p.medio,SUM(p.importe) total FROM venta_pos_pagos p JOIN ventas_pos v ON v.id=p.venta_id WHERE v.empresa_id=? AND v.caja_sesion_id=? GROUP BY p.medio`).all(e,id);
  res.json({ok:true,session,movements,paymentSummary:Object.fromEntries(payments.map(x=>[x.medio,Number(x.total)]))});
}
module.exports.closeCashSession=closeCashSession;
module.exports.cashSessionDetail=cashSessionDetail;

function getAppState(req,res){
  const row=db.prepare('SELECT valor_json,updated_at FROM app_state WHERE empresa_id=? AND clave=?').get(empresaId(req),String(req.params.key||''));
  let value=null; try{value=row?JSON.parse(row.valor_json):null}catch{value=null}
  res.json({ok:true,key:req.params.key,value,updatedAt:row?.updated_at||null});
}
function saveAppState(req,res){
  const key=String(req.params.key||'').trim();
  if(!key)return res.status(400).json({ok:false,error:'La clave es obligatoria.'});
  const value=req.body?.value ?? null;
  db.prepare(`INSERT INTO app_state(empresa_id,clave,valor_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(empresa_id,clave) DO UPDATE SET valor_json=excluded.valor_json,updated_at=CURRENT_TIMESTAMP`).run(empresaId(req),key,JSON.stringify(value));
  res.json({ok:true,key,value});
}
function deleteAppState(req,res){
  db.prepare('DELETE FROM app_state WHERE empresa_id=? AND clave=?').run(empresaId(req),String(req.params.key||''));
  res.json({ok:true});
}
module.exports.getAppState=getAppState;
module.exports.saveAppState=saveAppState;
module.exports.deleteAppState=deleteAppState;

function getModulosEmpresa(req,res){
  const rows=db.prepare('SELECT modulo,activo FROM modulos_empresa WHERE empresa_id=?').all(empresaId(req));
  res.json({ok:true,modulos:Object.fromEntries(rows.map(r=>[r.modulo,!!r.activo]))});
}
module.exports.getModulosEmpresa=getModulosEmpresa;

function listCobrosTemporales(req,res){
  const e=empresaId(req);
  const estado=String(req.query.estado||'').trim().toUpperCase();
  let sql='SELECT * FROM cobros_temporales WHERE empresa_id=?';
  const params=[e];
  if(estado){sql+=' AND estado=?';params.push(estado)}
  sql+=' ORDER BY id DESC';
  res.json({ok:true,cobros:db.prepare(sql).all(...params)});
}
function createCobroTemporal(req,res){
  const e=empresaId(req),d=req.body||{};
  const importe=Number(d.importe);
  const clienteNombre=String(d.cliente_nombre||'').trim();
  if(!clienteNombre)return res.status(400).json({ok:false,error:'Seleccioná un cliente.'});
  if(!(importe>0))return res.status(400).json({ok:false,error:'El importe debe ser mayor a 0.'});
  const info=db.prepare('INSERT INTO cobros_temporales(empresa_id,cliente_id,cliente_nombre,importe,observacion,estado,usuario_id) VALUES(?,?,?,?,?,?,?)').run(e,d.cliente_id||null,clienteNombre,Math.round(importe*100)/100,String(d.observacion||'').trim(),'PENDIENTE',Number(req.user?.id||req.usuario?.id||null)||null);
  res.status(201).json({ok:true,cobro:db.prepare('SELECT * FROM cobros_temporales WHERE id=?').get(info.lastInsertRowid)});
}
function deleteCobroTemporal(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const row=db.prepare('SELECT * FROM cobros_temporales WHERE id=? AND empresa_id=?').get(id,e);
  if(!row)return res.status(404).json({ok:false,error:'El cobro temporal no existe.'});
  if(row.estado!=='PENDIENTE')return res.status(409).json({ok:false,error:'Solo pueden eliminarse cobros PENDIENTES.'});
  db.prepare('DELETE FROM cobros_temporales WHERE id=? AND empresa_id=?').run(id,e);
  res.json({ok:true});
}
function enviarCobrosCuentaCorriente(req,res){
  const e=empresaId(req),d=req.body||{};
  const ids=Array.isArray(d.ids)?d.ids.map(Number).filter(Boolean):[];
  if(!ids.length)return res.status(400).json({ok:false,error:'Marcá al menos un cobro temporal.'});
  const rows=db.prepare(`SELECT * FROM cobros_temporales WHERE empresa_id=? AND id IN (${ids.map(()=>'?').join(',')}) AND estado='PENDIENTE'`).all(e,...ids);
  if(rows.length!==ids.length)return res.status(409).json({ok:false,error:'Uno o más cobros ya fueron enviados o no existen.'});
  const tx=db.transaction(()=>{
    const enviados=[];
    for(const c of rows){
      let clienteDoc='S/DOC';
      if(c.cliente_id){
        const cli=db.prepare('SELECT cuit,dni FROM clientes WHERE id=? AND empresa_id=?').get(c.cliente_id,e);
        if(cli)clienteDoc=cli.cuit||cli.dni||'S/DOC';
      }
      registrarMovimientoCC({empresaId:e,clienteId:c.cliente_id||null,clienteDoc,clienteNombre:c.cliente_nombre,tipo:'DEBE',concepto:`Cobro temporal`,debe:Number(c.importe),observaciones:c.observacion||`Cobro temporal N° ${c.id}`});
      db.prepare("UPDATE cobros_temporales SET estado='CUENTA_CORRIENTE',enviado_cc_at=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?").run(c.id,e);
      enviados.push(db.prepare('SELECT * FROM cobros_temporales WHERE id=?').get(c.id));
    }
    return enviados;
  });
  res.json({ok:true,cobros:tx()});
}
module.exports.listCobrosTemporales=listCobrosTemporales;
module.exports.createCobroTemporal=createCobroTemporal;
module.exports.deleteCobroTemporal=deleteCobroTemporal;
module.exports.enviarCobrosCuentaCorriente=enviarCobrosCuentaCorriente;

function listWhatsappPedidos(req,res){
  const e=empresaId(req);
  const rows=db.prepare("SELECT id,numero,punto_venta,estado,estado_reparto,importe_total,cliente_id,fecha,telefono_origen,created_at FROM documentos_comerciales WHERE empresa_id=? AND canal='WHATSAPP' AND tipo='NOTA_PEDIDO' ORDER BY id DESC LIMIT 50").all(e);
  res.json({ok:true,pedidos:rows});
}
function cambiarRepartoPedido(req,res){
  const e=empresaId(req),id=Number(req.params.id),estado=String(req.body?.estado||'PREPARANDO').toUpperCase();
  const doc=db.prepare("SELECT * FROM documentos_comerciales WHERE id=? AND empresa_id=? AND canal='WHATSAPP'").get(id,e);
  if(!doc)return res.status(404).json({ok:false,error:'Pedido de WhatsApp no encontrado.'});
  const validos=['PREPARANDO','LISTO','EN_CAMINO','ENTREGADO'];
  if(!validos.includes(estado))return res.status(400).json({ok:false,error:'Estado de reparto inválido.'});
  db.prepare("UPDATE documentos_comerciales SET estado_reparto=? WHERE id=?").run(estado,id);
  const msgs={PREPARANDO:'¡Lo tenemos en preparación! En breve te avisamos.',LISTO:'¡Está listo! Podés pasar a retirarlo cuando quieras.',EN_CAMINO:'¡Salió para entrega! Ya va en camino 🚚',ENTREGADO:'¡Entregado! Gracias por tu compra, nos vemos 👋'};
  db.prepare("INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado) VALUES(?,?,?,?,?,?)").run(e,doc.telefono_origen||'',id,estado,msgs[estado],'PENDIENTE');
  res.json({ok:true,estado});
}
async function enviarLinkPago(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const doc=db.prepare("SELECT * FROM documentos_comerciales WHERE id=? AND empresa_id=? AND canal='WHATSAPP'").get(id,e);
  if(!doc)return res.status(404).json({ok:false,error:'Pedido de WhatsApp no encontrado.'});
  const cfg=db.prepare('SELECT * FROM whatsapp_config WHERE empresa_id=? AND activo=1').get(e);
  const link=(cfg&&cfg.mercado_pago_link)?cfg.mercado_pago_link:null;
  const mensaje=link?'Pagá tu pedido con este enlace: '+link:'Pedí el enlace de pago a tu vendedor.';
  if(cfg&&cfg.token&&cfg.phone_id&&doc.telefono_origen){
    try{
      const resp=await fetch('https://graph.facebook.com/v21.0/'+encodeURIComponent(cfg.phone_id)+'/messages',{method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:doc.telefono_origen,type:'text',text:{body:mensaje}})});
      const json=await resp.json().catch(()=>({}));
      if(!resp.ok)return res.status(502).json({ok:false,error:'Meta rechazó el envío: '+(json.error?.message||('HTTP '+resp.status))});
      db.prepare("INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado) VALUES(?,?,?,?,?,?)").run(e,doc.telefono_origen||'',id,'PAGO',mensaje,'ENVIADA');
      return res.json({ok:true});
    }catch(err){return res.status(502).json({ok:false,error:'No se pudo enviar: '+err.message});}
  }
  db.prepare("INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado) VALUES(?,?,?,?,?,?)").run(e,doc.telefono_origen||'',id,'PAGO',mensaje,'PENDIENTE');
  res.json({ok:true,pendiente:true});
}
function verificarPago(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  db.prepare("UPDATE whatsapp_notificaciones SET estado='PAGO_VERIFICADO' WHERE id=? AND empresa_id=?").run(id,e);
  res.json({ok:true});
}
module.exports.listWhatsappPedidos=listWhatsappPedidos;
module.exports.cambiarRepartoPedido=cambiarRepartoPedido;
module.exports.enviarLinkPago=enviarLinkPago;
module.exports.verificarPago=verificarPago;


function getWhatsappConfig(req,res){
  const e=empresaId(req);
  const row=db.prepare('SELECT empresa_id,token,phone_id,numero,verify_token,activo,updated_at FROM whatsapp_config WHERE empresa_id=?').get(e);
  res.json({ok:true,config:row?{empresaId:row.empresa_id,token:row.token,phoneId:row.phone_id,numero:row.numero,verifyToken:row.verify_token,activo:!!row.activo,updatedAt:row.updated_at,configurado:Boolean(row.token&&row.phone_id)}:null});
}
function saveWhatsappConfig(req,res){
  const e=empresaId(req),d=req.body||{};
  db.prepare(`INSERT INTO whatsapp_config(empresa_id,token,phone_id,numero,verify_token,activo,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(empresa_id) DO UPDATE SET token=excluded.token,phone_id=excluded.phone_id,numero=excluded.numero,verify_token=excluded.verify_token,activo=excluded.activo,updated_at=CURRENT_TIMESTAMP`).run(e,d.token||null,d.phoneId||null,d.numero||null,d.verifyToken||null,d.activo?1:0);
  res.json({ok:true});
}
async function probarWhatsappConfig(req,res){
  const e=empresaId(req);
  const cfg=db.prepare('SELECT * FROM whatsapp_config WHERE empresa_id=?').get(e);
  if(!cfg||!cfg.token||!cfg.phone_id)return res.status(400).json({ok:false,error:'Configuración incompleta: cargá el token y el phone ID.'});
  try{
    const resp=await fetch('https://graph.facebook.com/v21.0/'+encodeURIComponent(cfg.phone_id),{headers:{Authorization:'Bearer '+cfg.token}});
    const json=await resp.json().catch(()=>({}));
    if(!resp.ok)return res.status(502).json({ok:false,error:'Meta respondió con error: '+(json.error?.message||('HTTP '+resp.status))});
    res.json({ok:true,info:{nombre:json.display_phone_number||cfg.numero,verificado:json.verified_name||''}});
  }catch(err){
    res.status(502).json({ok:false,error:'No se pudo conectar con Meta: '+err.message});
  }
}
async function enviarNotificacionWhatsapp(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const n=db.prepare('SELECT * FROM whatsapp_notificaciones WHERE id=? AND empresa_id=?').get(id,e);
  if(!n)return res.status(404).json({ok:false,error:'Notificación no encontrada.'});
  const cfg=db.prepare('SELECT * FROM whatsapp_config WHERE empresa_id=? AND activo=1').get(e);
  if(!cfg||!cfg.token||!cfg.phone_id)return res.status(400).json({ok:false,error:'La conexión de WhatsApp no está configurada. Cargá el token y el phone ID en la tarjeta de conexión.'});
  try{
    const resp=await fetch('https://graph.facebook.com/v21.0/'+encodeURIComponent(cfg.phone_id)+'/messages',{
      method:'POST',
      headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:n.telefono,type:'text',text:{body:n.mensaje}}),
    });
    const json=await resp.json().catch(()=>({}));
    if(!resp.ok)return res.status(502).json({ok:false,error:'Meta rechazó el envío: '+(json.error?.message||('HTTP '+resp.status))});
    db.prepare("UPDATE whatsapp_notificaciones SET estado='ENVIADA' WHERE id=?").run(id);
    res.json({ok:true,mensajeId:json.messages?.[0]?.id||null});
  }catch(err){
    res.status(502).json({ok:false,error:'No se pudo enviar: '+err.message});
  }
}
module.exports.getWhatsappConfig=getWhatsappConfig;
module.exports.saveWhatsappConfig=saveWhatsappConfig;
module.exports.probarWhatsappConfig=probarWhatsappConfig;
module.exports.enviarNotificacionWhatsapp=enviarNotificacionWhatsapp;


function listCuponesSorteo(req,res){
  const e=empresaId(req);
  const rows=db.prepare(`SELECT cs.id,cs.numero,cs.cliente_nombre,cs.fecha_entrega,cs.estado,cs.venta_id,rs.nombre sorteo,rs.premio,rs.fecha_sorteo FROM cupones_sorteo cs LEFT JOIN reglas_sorteo rs ON rs.id=cs.regla_id WHERE cs.empresa_id=? ORDER BY cs.numero DESC LIMIT 500`).all(e);
  res.json({ok:true,cupones:rows});
}
function updateCuponSorteo(req,res){
  const e=empresaId(req),id=Number(req.params.id),estado=String(req.body?.estado||'ENTREGADO').toUpperCase();
  const r=db.prepare("UPDATE cupones_sorteo SET estado=? WHERE id=? AND empresa_id=?").run(estado==='GANADOR'?'GANADOR':estado==='USADO'?'USADO':'ENTREGADO',id,e);
  if(!r.changes)return res.status(404).json({ok:false,error:'Cupón no encontrado.'});
  res.json({ok:true});
}
function listWhatsappNotificaciones(req,res){
  const e=empresaId(req);
  const rows=db.prepare("SELECT n.id,n.telefono,n.pedido_id,n.estado_pedido,n.mensaje,n.estado,n.created_at,d.numero pedido_numero FROM whatsapp_notificaciones n LEFT JOIN documentos_comerciales d ON d.id=n.pedido_id WHERE n.empresa_id=? ORDER BY n.id DESC LIMIT 100").all(e);
  res.json({ok:true,notificaciones:rows});
}
function marcarNotificacionEnviada(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  db.prepare("UPDATE whatsapp_notificaciones SET estado='ENVIADA' WHERE id=? AND empresa_id=?").run(id,e);
  res.json({ok:true});
}
async function enviarMensajeWhatsappTray(req,res){
  const e=empresaId(req),id=Number(req.params.id),mensaje=String(req.body?.mensaje||'').trim();
  if(!mensaje)return res.status(400).json({ok:false,error:'El mensaje es obligatorio.'});
  const conv=db.prepare("SELECT * FROM conversations WHERE id=? AND empresa_id=?").get(id,e);
  if(!conv)return res.status(404).json({ok:false,error:'Conversación no encontrada.'});
  try{
    const Engine=require('../core/commercial-conversation/commercialConversationEngine');
    const Service=require('../core/commercial-conversation/commercialConversationService');
    const conversation=Service.hydrate(conv);
    const context=conversation.context;
    const engineResult=await Engine.continue({context,message:mensaje,empresaId:e,usuarioId:req.usuario?.id||null,empresaNombre:req.empresa.nombre});
    Service.save(conversation);
    const reply=(engineResult&&engineResult.response&&engineResult.response.message)||null;
    const cfg=db.prepare("SELECT * FROM whatsapp_config WHERE empresa_id=? AND activo=1").get(e);
    if(reply&&cfg&&cfg.token&&cfg.phone_id&&conv.telefono){
      try{
        const resp=await fetch('https://graph.facebook.com/v21.0/'+encodeURIComponent(cfg.phone_id)+'/messages',{method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:conv.telefono,type:'text',text:{body:reply}})});
        const json=await resp.json().catch(()=>({}));
        if(!resp.ok)return res.status(502).json({ok:false,error:'Meta rechazó el envío: '+(json.error?.message||('HTTP '+resp.status))});
        return res.json({ok:true,estado:conv.estado,respuesta:reply,enviado:true,command:context.command||null});
      }catch(err){return res.status(502).json({ok:false,error:'No se pudo enviar: '+err.message});}
    }
    res.json({ok:true,estado:conv.estado,respuesta:reply,enviado:false,command:context.command||null});
  }catch(err){
    res.status(500).json({ok:false,error:'No se pudo procesar el mensaje: '+err.message});
  }
}
module.exports.listCuponesSorteo=listCuponesSorteo;
module.exports.updateCuponSorteo=updateCuponSorteo;
module.exports.listWhatsappNotificaciones=listWhatsappNotificaciones;
module.exports.marcarNotificacionEnviada=marcarNotificacionEnviada;
module.exports.enviarMensajeWhatsappTray=enviarMensajeWhatsappTray;


function listWhatsappConversations(req,res){
  const e=empresaId(req);
  const rows=db.prepare("SELECT c.id,c.telefono,c.estado,c.contexto,c.created_at,c.updated_at,c.moderador,w.nombre whatsapp_nombre,cl.razon_social cliente_nombre FROM conversations c LEFT JOIN whatsapp_autorizados w ON w.empresa_id=c.empresa_id AND w.telefono=c.telefono LEFT JOIN whatsapp_clientes wc ON wc.empresa_id=c.empresa_id AND wc.telefono=c.telefono AND wc.estado='APROBADO' LEFT JOIN clientes cl ON cl.id=wc.cliente_id WHERE c.empresa_id=? ORDER BY c.updated_at DESC LIMIT 100").all(e);
  res.json({ok:true,conversaciones:rows.map(r=>{let cmd=null;try{const ctx=JSON.parse(r.contexto||'{}');cmd=ctx.command||null}catch(err){}return {id:r.id,telefono:r.telefono,estado:r.estado,moderador:!!r.moderador,whatsappNombre:r.whatsapp_nombre,clienteNombre:r.cliente_nombre,createdAt:r.created_at,updatedAt:r.updated_at,command:cmd}})});
}
function tomarConversacionWhatsapp(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const mod=req.body?.moderador?1:0;
  const r=db.prepare("UPDATE conversations SET moderador=? WHERE id=? AND empresa_id=?").run(mod,id,e);
  if(!r.changes)return res.status(404).json({ok:false,error:'Conversación no encontrada.'});
  res.json({ok:true,moderador:!!mod});
}
function crearPedidoWhatsapp(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const conv=db.prepare("SELECT * FROM conversations WHERE id=? AND empresa_id=?").get(id,e);
  if(!conv)return res.status(404).json({ok:false,error:'Conversación no encontrada.'});
  let cmd=null;try{cmd=JSON.parse(conv.contexto||'{}').command||null}catch(err){}
  const items=(cmd?.products||[]).filter(p=>p?.codigo&&Number(p?.cantidad)>0);
  if(!items.length)return res.status(409).json({ok:false,error:'El bot aún no resolvió los productos de la conversación. Completala desde el chat o cargá el pedido manualmente.'});
  const clienteNombre=String(cmd?.customer?.text||'').trim()||conv.telefono;
  const cliente=db.prepare("SELECT * FROM clientes WHERE empresa_id=? AND (razon_social=? COLLATE NOCASE OR cuit=? OR dni=?) LIMIT 1").get(e,clienteNombre,clienteNombre,clienteNombre);
  const { saveDocumento } = require("../repositories/documentoComercial.repository");
  const doc=saveDocumento({
    empresaId:e,
    clienteId:cliente?.id||null,
    tipo:'NOTA_PEDIDO',
    estado:'CONFIRMADO',
    items:items.map(p=>{const prod=db.prepare('SELECT id FROM productos WHERE empresa_id=? AND codigo=?').get(e,p.codigo);return {producto_id:prod?.id||p.productoId||null,codigo:p.codigo,descripcion:p.descripcion||p.codigo,unidad:p.unidad||'UN',cantidad:Number(p.cantidad),precio_unitario:Number(p.precio||0),descuento:0,iva:Number(p.iva||21)}}),
    observaciones:'Pedido por WhatsApp '+conv.telefono,
    canal:'WHATSAPP',
  });
  db.prepare("UPDATE conversations SET estado='COMPLETED' WHERE id=?").run(id);
  db.prepare("INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado) VALUES(?,?,?,?,?,?)").run(e,conv.telefono,doc.id,doc.estado,`¡Pedido confirmado, ${conv.whatsappNombre || conv.telefono}! Lo dejamos en preparación, dale que va 👍`,'PENDIENTE');
  res.status(201).json({ok:true,documento:{id:doc.id,tipo:doc.tipo,estado:doc.estado}});
}
module.exports.listWhatsappConversations=listWhatsappConversations;
module.exports.tomarConversacionWhatsapp=tomarConversacionWhatsapp;
module.exports.crearPedidoWhatsapp=crearPedidoWhatsapp;


function printPaymentOrder(req,res){
  const e=empresaId(req),id=Number(req.params.id);
  const op=db.prepare('SELECT o.*,p.nombre proveedor_nombre,p.cuit proveedor_cuit,p.domicilio proveedor_domicilio FROM ordenes_pago o LEFT JOIN proveedores p ON p.id=o.proveedor_id WHERE o.id=? AND o.empresa_id=?').get(id,e);
  if(!op)return res.status(404).send('Orden de pago no encontrada.');
  const cheques=db.prepare('SELECT c.numero,c.banco_origen,c.librador,c.importe FROM orden_pago_cheques oc JOIN cheques c ON c.id=oc.cheque_id WHERE oc.orden_pago_id=?').all(id);
  const emp=db.prepare('SELECT razon_social nombre,cuit FROM empresas WHERE id=?').get(e)||{};
  const esc=(s)=>String(s||'').replace(/[&<>]/g,(x)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[x]));
  const filas=cheques.map(ch=>'<tr><td>'+esc(ch.numero)+'</td><td>'+esc(ch.banco_origen)+'</td><td>'+esc(ch.librador)+'</td><td class="r">$ '+Number(ch.importe).toLocaleString('es-AR',{minimumFractionDigits:2})+'</td></tr>').join('');
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Orden de pago</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111;font-size:13px}.center{text-align:center}.head{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}h1{font-size:20px;margin:6px 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}table{width:100%;border-collapse:collapse}th,td{padding:6px;border-bottom:1px solid #bbb;text-align:left}.r{text-align:right}.total{text-align:right;font-weight:bold;font-size:16px;margin-top:12px}.retencion{margin-top:14px;padding:10px;border:1px dashed #999;font-size:11.5px;line-height:1.6}@media print{.actions{display:none}}</style></head><body><main><div class="head center"><h2>'+esc(emp.nombre||'EMPRESA')+'</h2><div>CUIT '+esc(emp.cuit||'')+'</div><h1>ORDEN DE PAGO</h1><b>OP-'+String(op.numero).padStart(8,'0')+'</b><div>'+esc(String(op.fecha||'').slice(0,10))+'</div></div><div class="meta"><span>Proveedor: <strong>'+esc(op.proveedor_nombre)+'</strong></span><span>CUIT: '+esc(op.proveedor_cuit||'-')+'</span><span>Domicilio: '+esc(op.proveedor_domicilio||'-')+'</span><span>Concepto: '+esc(op.concepto||'-')+'</span></div>'+(cheques.length?'<h3>Cheques entregados</h3><table><thead><tr><th>Número</th><th>Banco</th><th>Librador</th><th class="r">Importe</th></tr></thead><tbody>'+filas+'</tbody></table>':'')+'<div class="total">Efectivo: $ '+Number(op.efectivo||0).toLocaleString('es-AR',{minimumFractionDigits:2})+' · Transferencia: $ '+Number(op.transferencia||0).toLocaleString('es-AR',{minimumFractionDigits:2})+'<br/>TOTAL: $ '+Number(op.total||0).toLocaleString('es-AR',{minimumFractionDigits:2})+'</div><div class="retencion"><strong>Retenciones:</strong> Si corresponde agente de retención (IIBB / Ganancias / IVA), esta orden de pago es el comprobante base. Constancia de retención: ________________</div><div class="actions"><button onclick="window.print()">Imprimir</button></div></main><script>setTimeout(()=>window.print(),300)</script></body></html>';
  res.type('html').send(html);
}
module.exports.printPaymentOrder=printPaymentOrder;


function appEstado(req,res){
  const e=empresaId(req);
  const vrow=db.prepare("SELECT version FROM sistema_version WHERE id=1").get();
  let version=vrow?.version||'4.0.0-beta.2.2';
  try{const pkg=require('../../package.json');if(pkg&&pkg.version&&!vrow)version=pkg.version}catch(err){}
  const empresa=db.prepare('SELECT version_instalada FROM empresas WHERE id=?').get(e)||{};
  const lic=db.prepare("SELECT * FROM licencias WHERE empresa_id=? AND estado='ACTIVA' ORDER BY id DESC LIMIT 1").get(e)||null;
  const versionInstalada=String(empresa.version_instalada||'').trim()||version;
  const actualizado=versionInstalada===version;
  res.json({
    ok:true,
    version,
    versionInstalada,
    actualizado,
    licencia: lic?{
      plan:lic.plan,
      estado:lic.estado,
      fechaInicio:lic.fecha_inicio||null,
      fechaVencimiento:lic.fecha_vencimiento||null,
      definitiva:lic.plan==='DEFINITIVO'||!lic.fecha_vencimiento,
      actualizacionesIncluidas:lic.estado==='ACTIVA',
    }:null,
  });
}
module.exports.appEstado=appEstado;



function consumirReservasStock(docId, e) {
  db.prepare("UPDATE stock_reservas SET estado='CONSUMIDA',updated_at=CURRENT_TIMESTAMP WHERE empresa_id=? AND documento_id=? AND estado='ACTIVA'").run(e, docId);
}

function notifWhatsappDoc(docId, estado) {
  try {
    const d = db.prepare("SELECT canal,telefono_origen FROM documentos_comerciales WHERE id=?").get(docId);
    if (d && d.canal === "WHATSAPP") {
      const msgs = { CONFIRMADO: "¡Pedido confirmado! Lo dejamos en preparación, dale que va 👍", FACTURADO: "¡Listo! Tu pedido ya está facturado.", REMITIDO: "¡Salió para entrega! Ya va en camino a tu dirección 🚚", ANULADO: "Cancelamos tu pedido. Cualquier cosa, avisanos y lo reactivamos." };
      db.prepare("INSERT INTO whatsapp_notificaciones(empresa_id,telefono,pedido_id,estado_pedido,mensaje,estado) VALUES((SELECT empresa_id FROM documentos_comerciales WHERE id=?),?,?,?,?,?)").run(docId, d.telefono_origen || "", docId, estado, msgs[estado] || ("Tu pedido cambió a estado " + estado + "."), "PENDIENTE");
    }
  } catch (e) {}
}

function limpiarNotasVenta(e){
  const cfg=db.prepare('SELECT auto_eliminar_notax_dias FROM empresa_configuraciones WHERE empresa_id=?').get(e);
  const dias=Number(cfg?.auto_eliminar_notax_dias||0);
  if(!(dias>0))return 0;
  const d=new Date(); d.setDate(d.getDate()-dias);
  const fechaCorte=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const docs=db.prepare("SELECT id FROM documentos_comerciales WHERE empresa_id=? AND tipo='NOTA_X' AND estado IN ('BORRADOR','PENDIENTE','CONFIRMADO') AND substr(fecha,1,10)<=?").all(e,fechaCorte);
  for(const doc of docs){
    db.prepare("DELETE FROM documento_relaciones WHERE documento_origen_id=? OR documento_destino_id=?").run(doc.id, doc.id);
    db.prepare("DELETE FROM fiscal_intentos WHERE documento_id=?").run(doc.id);
    db.prepare("DELETE FROM cliente_cc_aplicaciones WHERE movimiento_debe_id IN (SELECT id FROM cliente_cc_movimientos WHERE documento_id=? AND tipo IN ('FACTURA','NOTA_X','DEBE')) OR movimiento_haber_id IN (SELECT id FROM cliente_cc_movimientos WHERE documento_id=? AND tipo IN ('FACTURA','NOTA_X','DEBE'))").run(doc.id, doc.id);
    db.prepare("DELETE FROM cliente_cc_movimientos WHERE documento_id=? AND tipo IN ('FACTURA','NOTA_X','DEBE')").run(doc.id);
    db.prepare("DELETE FROM documento_items WHERE documento_id=?").run(doc.id);
    db.prepare("DELETE FROM ventas_pos WHERE documento_id=?").run(doc.id);
    db.prepare("DELETE FROM documentos_comerciales WHERE id=?").run(doc.id);
  }
  return docs.length;
}
module.exports.limpiarNotasVenta=limpiarNotasVenta;


function listChangelog(req,res){
  const rows=db.prepare("SELECT id,version,fecha,tipo,titulo,detalle FROM changelog ORDER BY fecha DESC, id DESC").all();
  res.json({ok:true,entradas:rows});
}
module.exports.listChangelog=listChangelog;
