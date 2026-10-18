import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { erpApi } from "../../services/api";
import { fmtFechaHora } from "../../utils/fecha";
import { calcularArqueo, arqueoConContado } from "../../utils/arqueo";

function primerDiaDelMes(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`}
function hoyISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function money(v:any){return Number(v||0).toLocaleString('es-AR',{minimumFractionDigits:2})}

export function CashClosuresPage(){
  const [rows,setRows]=useState<any[]>([]); const [expanded,setExpanded]=useState<any>(null); const [pvFilter,setPvFilter]=useState(''); const [pointsOfSale,setPointsOfSale]=useState<any[]>([]); const [error,setError]=useState('');
  const [desde,setDesde]=useState(primerDiaDelMes()); const [hasta,setHasta]=useState(hoyISO()); const [resumen,setResumen]=useState<any>(null);
  /* Cierre con arqueo: se pide el efectivo contado y se guarda la diferencia. */
  const [cierre,setCierre]=useState<any>(null);
  async function load(){try{const [r,p]=await Promise.all([erpApi.listCashSessions(),erpApi.listPointsOfSale()]);setRows(r.sessions||[]);setPointsOfSale(p.pointsOfSale||[])}catch(e:any){setError(e.message)}}
  useEffect(()=>{load()},[]);
  /*
   * Resumen del período (todo lo cobrado por medio de pago): se consulta al
   * servidor por rango de fechas, así también entran las ventas hechas sin
   * conexión, que conservan su fecha real de cobro.
   */
  useEffect(()=>{erpApi.cashCollections({desde,hasta,pv:Number(pvFilter)||undefined}).then(setResumen).catch(()=>setResumen(null))},[desde,hasta,pvFilter]);
  async function toggle(row:any){if(expanded?.session?.id===row.id){setExpanded(null);return}try{setExpanded(await erpApi.getCashSession(row.id))}catch(e:any){setError(e.message)}}
  async function abrirCierre(row:any){
    try{
      const detail=await erpApi.getCashSession(row.id);
      const a=calcularArqueo(detail);
      setCierre({row,detail,efectivo:String(a.efectivoTeorico),observaciones:''});
    }catch(e:any){setError(e.message)}
  }
  async function confirmarCierre(){
    if(!cierre)return;
    try{
      const a=arqueoConContado(cierre.detail,cierre.efectivo);
      await erpApi.closeCashSession(cierre.row.id,{
        importe_contado:a.total,
        arqueo:{efectivo_contado:a.efectivo,efectivo_teorico:a.efectivoTeorico,otros_medios:a.otros,saldo_teorico:a.saldo},
        observaciones:cierre.observaciones||'',
      });
      setCierre(null); setExpanded(null); await load();
    }catch(e:any){setError(e.message)}
  }
  const enRango=(f:any)=>{const d=String(f||'').slice(0,10);return (!desde||d>=desde)&&(!hasta||d<=hasta)};
  const visible=rows.filter(r=>enRango(r.fecha_apertura)&&(!pvFilter||Number(r.punto_venta)===Number(pvFilter)));
  const totalesCierre=cierre?arqueoConContado(cierre.detail,cierre.efectivo):null;
  return <div className="products-page"><div className="products-toolbar"><div><h3>Cierres de caja</h3><p>Todo lo cobrado y las sesiones de caja entre dos fechas, con el detalle de cada turno.</p></div></div>{error&&<div className="error-box">{error}</div>}<div className="report-filters"><label>Desde<input type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></label><label>Hasta<input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></label><label>Punto de venta<select value={pvFilter} onChange={e=>setPvFilter(e.target.value)}><option value="">Todos</option>{pointsOfSale.map((p:any)=><option key={p.id} value={p.numero}>{p.numero} · {p.nombre||`PV ${p.numero}`}</option>)}</select></label></div>
    <div className="products-card" style={{marginBottom:12}}><div className="cash-detail"><h4>COBROS DEL PERÍODO</h4><div className="stats-grid"><div><span>TOTAL COBRADO</span><strong>$ {money(resumen?.total)}</strong><small>{Number(resumen?.operaciones||0)} operación(es) del POS</small></div>{(resumen?.medios||[]).map((m:any)=><div key={m.medio}><span>{String(m.medio||'').toUpperCase()}</span><strong>$ {money(m.importe)}</strong><small>{Number(m.ventas||0)} venta(s)</small></div>)}<div><span>SESIONES DE CAJA</span><strong>{Number(resumen?.sesiones||0)}</strong></div></div><p className="cash-detail-hint">Los cobros por cuenta corriente se ven en Cuentas clientes → recibos de cobro. Este total es lo cobrado por el POS (efectivo, transferencia, tarjeta, QR y cheques).</p></div></div>
    <div className="products-card"><table><thead><tr><th>Apertura</th><th>Cierre</th><th>PV</th><th>Sucursal</th><th>Cajero</th><th>Saldo teórico</th><th>Estado</th><th></th></tr></thead><tbody>{visible.map((r:any)=><><tr key={r.id}><td>{fmtFechaHora(r.fecha_apertura)}</td><td>{fmtFechaHora(r.fecha_cierre)}</td><td>{r.punto_venta?`PV ${String(r.punto_venta).padStart(4,'0')}`:'—'}</td><td>{r.sucursal||'Principal'}</td><td>{r.cajero||'Usuario actual'}</td><td className="price">$ {money(r.saldo_teorico)}</td><td>{r.estado}</td><td className="inline-actions"><button onClick={()=>toggle(r)}>Detalle</button>{r.estado==='ABIERTA'&&<button onClick={()=>abrirCierre(r)}>Cerrar</button>}</td></tr>{expanded?.session?.id===r.id&&<tr><td colSpan={8}><div className="cash-detail"><div className="stats-grid">{Object.entries(expanded.paymentSummary||{}).map(([k,v]:any)=><div key={k}><span>{k}</span><strong>$ {money(v)}</strong></div>)}{expanded.session?.importe_contado!=null&&<div><span>CONTADO AL CIERRE</span><strong>$ {money(expanded.session.importe_contado)}</strong></div>}{expanded.session?.diferencia!=null&&<div><span>DIFERENCIA</span><strong>$ {money(expanded.session.diferencia)}</strong></div>}{expanded.session?.observaciones_cierre&&<div><span>OBSERVACIONES</span><strong>{String(expanded.session.observaciones_cierre)}</strong></div>}</div><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Cliente</th><th>Importe</th></tr></thead><tbody>{(expanded.movements||[]).map((m:any)=><tr key={m.id}><td>{fmtFechaHora(m.created_at)}</td><td>{m.tipo}</td><td>{m.concepto}</td><td>{m.cliente_nombre||'-'}</td><td>$ {money(m.importe)}</td></tr>)}</tbody></table></div></td></tr>}</>)}</tbody></table>{!visible.length&&<div className="empty-table">No hay sesiones de caja en el período seleccionado.</div>}</div>
    {cierre&&totalesCierre&&<div className="modal-backdrop"><div className="modal polished-modal"><div className="modal-head"><div><h3>Cerrar caja #{cierre.row.id}</h3><p>Contá el efectivo del turno. Los demás medios (tarjeta, transferencia, QR, cheques) se toman del sistema.</p></div><button type="button" onClick={()=>setCierre(null)}><X size={18}/></button></div><div className="form-grid"><div className="full stats-grid"><div><span>SALDO TEÓRICO</span><strong>$ {money(totalesCierre.saldo)}</strong></div><div><span>EFECTIVO ESPERADO</span><strong>$ {money(totalesCierre.efectivoTeorico)}</strong></div><div><span>OTROS MEDIOS / MOVIMIENTOS</span><strong>$ {money(totalesCierre.otros)}</strong></div><div><span>DIFERENCIA</span><strong>$ {money(totalesCierre.diferencia)}</strong></div></div><label>Efectivo contado<input type="number" step="0.01" value={cierre.efectivo} onChange={e=>setCierre({...cierre,efectivo:e.target.value})} onFocus={e=>e.currentTarget.select()}/></label><label>Observaciones<input value={cierre.observaciones} onChange={e=>setCierre({...cierre,observaciones:e.target.value})} placeholder="Opcional: faltante, billetes, novedades del turno"/></label></div><div className="modal-actions"><button type="button" onClick={()=>setCierre(null)}>Cancelar</button><button className="primary-action" onClick={confirmarCierre}>Cerrar caja</button></div></div></div>}
  </div>
}
