import { useState, useEffect } from "react";
import { Download, Printer } from "lucide-react";
import { api, erpApi } from "../../services/api";

const REPORTES: [string, string][] = [
  ["VENTAS_CAJERO", "Ventas por cajero"],
  ["VENTAS_VENDEDOR", "Ventas por vendedor"],
  ["VENTAS_POR_PRODUCTO", "Ventas por producto"],
  ["RENTABILIDAD", "Rentabilidad"],
  ["COMISIONES", "Comisiones"],
  ["CAJA", "Sesiones de caja"],
  ["PEDIDOS", "Notas de pedido"],
  ["IVA", "IVA ventas"],
];

export function ReportsPage() {
  const [type, setType] = useState('VENTAS_CAJERO');
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any>({ ops: [], docs: [], comisiones: [], sessions: [], productos: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      erpApi.listPosOperations().catch(() => ({ operations: [] })),
      api.listDocuments().catch(() => ({ documentos: [] })),
      erpApi.listComisiones().catch(() => ({ comisiones: [] })),
      erpApi.listCashSessions().catch(() => ({ sessions: [] })),
    ]).then(([ops, docs, com, ses]) => setData({ ops: ops.operations || [], docs: docs.documentos || [], comisiones: com.comisiones || [], sessions: ses.sessions || [], productos: data.productos }))
      .catch((e: any) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { ops, docs, comisiones, sessions } = data;
  const between = (d: string) => { const x = String(d || '').slice(0, 10); return x >= from && x <= to };
  const concepto = (o: any) => `${o.tipo || 'VENTA'} ${String(o.punto_venta || 1).padStart(4, '0')}-${String(o.numero || 0).padStart(8, '0')}`;
  const esFiscal = (t: string) => /FACTURA|NOTA DE (CRÉDITO|CREDITO|DÉBITO|DEBITO)/i.test(String(t));
  let rows: any[] = [];
  if (type === 'COMISIONES') rows = comisiones.filter((d: any) => between(d.created_at || d.fecha)).map((d: any) => ({ concepto: `Comisión #${d.id}`, persona: d.vendedor_nombre || '', extra: d.estado || '', total: d.base_calculo, resultado: d.importe }));
  else if (type === 'RENTABILIDAD') rows = ops.filter((o: any) => between(o.fecha || o.created_at) && esFiscal(String(o.tipo)) && o.estado !== 'ANULADO').map((o: any) => ({ concepto: concepto(o), persona: o.cliente || '', extra: '', total: o.total, resultado: Number(o.total || 0) - Number(o.costo_total || 0) }));
  else if (type === 'VENTAS_CAJERO') rows = ops.filter((o: any) => between(o.fecha || o.created_at) && o.estado !== 'ANULADO').map((o: any) => ({ concepto: concepto(o), persona: o.cajero || 'Usuario actual', extra: o.estado || '', total: o.total, resultado: o.total }));
  else if (type === 'VENTAS_VENDEDOR') rows = ops.filter((o: any) => between(o.fecha || o.created_at) && o.estado !== 'ANULADO' && o.vendedor_nombre).map((o: any) => ({ concepto: concepto(o), persona: o.vendedor_nombre, extra: o.estado || '', total: o.total, resultado: o.total }));
  else if (type === 'CAJA') rows = sessions.filter((d: any) => between(d.fecha_apertura || d.created_at)).map((d: any) => ({ concepto: `Sesión #${d.id} (${d.estado})`, persona: d.cajero || '—', extra: d.punto_venta ? `PV ${String(d.punto_venta).padStart(4, '0')}` : '', total: d.saldo_teorico, resultado: Number(d.saldo_teorico) - Number(d.importe_apertura) }));
  else if (type === 'PEDIDOS') rows = ops.filter((o: any) => /NOTA_PEDIDO|PRESUPUESTO|RESERVA|REMITO|NOTA_X/.test(String(o.tipo)) && between(o.fecha || o.created_at)).map((o: any) => ({ concepto: concepto(o), persona: o.cliente || '', extra: o.estado || '', total: o.total, resultado: o.total }));
  else if (type === 'IVA') rows = docs.filter((d: any) => between(d.created_at) && esFiscal(String(d.tipo))).map((d: any) => ({ concepto: `${d.tipo} ${String(d.punto_venta || 1).padStart(4, '0')}-${String(d.numero || 0).padStart(8, '0')}`, persona: d.cliente_nombre || d.cliente || '', extra: `${d.comprobante_letra || ''} ${d.cae ? `CAE ${d.cae}` : ''}`.trim(), total: d.iva != null ? d.iva : 0, resultado: d.total }));
  const [productos, setProductos] = useState<any[]>([]);
  const [prodTotales, setProdTotales] = useState<any>({ importe: 0, costo: 0, unidades: 0 });
  const [prodLoading, setProdLoading] = useState(false);
  const [ranking, setRanking] = useState<any>({ vendedores: [], cajeros: [] });
  const [rankingLoading, setRankingLoading] = useState(false);
  useEffect(() => {
    setRankingLoading(true);
    erpApi.rankingVentas(from, to)
      .then((r: any) => setRanking({ vendedores: r.vendedores || [], cajeros: r.cajeros || [] }))
      .catch(() => {})
      .finally(() => setRankingLoading(false));
  }, [from, to]);
  useEffect(() => {
    if (type !== 'VENTAS_POR_PRODUCTO') return;
    setProdLoading(true);
    erpApi.reporteProductos(from, to)
      .then((r: any) => { setProductos(r.productos || []); setProdTotales(r.totales || {}); })
      .catch((e: any) => setError(e.message))
      .finally(() => setProdLoading(false));
  }, [type, from, to]);
  const porProducto = type === 'VENTAS_POR_PRODUCTO';
  const total = rows.reduce((n, r) => n + Number(r.resultado || 0), 0);
  const totalProd = prodTotales.importe || 0;
  function exportCsv() {
    const head = porProducto
      ? 'Código,Producto,Unidades,Ventas,Importe,Costo,Ganancia'
      : 'Comprobante/Concepto,Persona,Detalle,Total,Resultado';
    const body = porProducto
      ? productos.map(p => `"${p.codigo}","${p.descripcion}",${p.cantidad},${p.ventas},${p.importe},${p.costo},${Number(p.importe) - Number(p.costo)}`)
      : rows.map(r => `"${r.concepto}","${r.persona}","${r.extra || ''}",${r.total},${r.resultado}`);
    const csv = [head, ...body].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `reporte-${type}-${from}-${to}.csv`;
    a.click();
  }
  const chartRows = porProducto ? productos.slice(0, 12) : rows.slice(0, 12);
  const max = Math.max(1, ...chartRows.map(r => Math.abs(Number(porProducto ? r.importe : r.resultado || 0))));
  const chartLabel = (r: any) => String(porProducto ? r.descripcion : r.concepto).slice(-8);
  return <div className="products-page"><div className="products-toolbar"><div><h3>Centro de reportes</h3><p>Reportes sobre datos reales: POS, comprobantes, comisiones, caja y productos.</p></div><div className="inline-actions"><button onClick={exportCsv}><Download size={16} /> Excel/CSV</button><button onClick={() => window.print()}><Printer size={16} /> PDF / imprimir</button></div></div><div className="report-hub">{REPORTES.map(([id, label]) => <button key={id} className={type === id ? 'active' : ''} onClick={() => setType(id)}><strong>{label}</strong><span>Ver detalle por rango de fechas</span></button>)}</div><div className="report-filters"><label>Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>{error && <div className="error-box">{error}</div>}<div className="ranking-grid"><div className="ranking-panel"><h4>Vendedores con más ventas</h4>{rankingLoading ? <div className="empty-table">Calculando ranking…</div> : ranking.vendedores.length ? ranking.vendedores.slice(0, 5).map((v: any, i: number) => <div key={i} className={i === 0 ? 'ranking-row top' : 'ranking-row'}><span className="ranking-pos">{i + 1}</span><span className="ranking-name">{v.nombre}</span><span className="ranking-meta">{v.ventas} venta{v.ventas === 1 ? '' : 's'}</span><span className="ranking-total">$ {Number(v.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></div>) : <div className="empty-table">Sin ventas en el período.</div>}</div><div className="ranking-panel"><h4>Cajeros con más ventas</h4>{rankingLoading ? <div className="empty-table">Calculando ranking…</div> : ranking.cajeros.length ? ranking.cajeros.slice(0, 5).map((v: any, i: number) => <div key={i} className={i === 0 ? 'ranking-row top' : 'ranking-row'}><span className="ranking-pos">{i + 1}</span><span className="ranking-name">{v.nombre}</span><span className="ranking-meta">{v.ventas} venta{v.ventas === 1 ? '' : 's'}</span><span className="ranking-total">$ {Number(v.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></div>) : <div className="empty-table">Sin ventas en el período.</div>}</div></div>{porProducto && prodLoading ? <div className="empty-table">Calculando ventas por producto…</div> : chartRows.length > 0 && <div className="report-chart">{chartRows.map((r: any, i: number) => <span key={i} style={{ height: `${Math.max(4, Math.abs(Number(porProducto ? r.importe : r.resultado || 0)) / max * 100)}%` }} title={`${chartLabel(r)}: $ ${Number(porProducto ? r.importe : r.resultado || 0).toLocaleString('es-AR')}`}><small>{chartLabel(r)}</small></span>)}</div>}<div className="products-card"><table><thead>{porProducto ? <tr><th>Código</th><th>Producto</th><th>Unidades</th><th>Ventas</th><th>Importe</th><th>Costo</th><th>Ganancia</th></tr> : <tr><th>Comprobante / concepto</th><th>Persona</th><th>Detalle</th><th>Total</th><th>Resultado</th></tr>}</thead><tbody>{porProducto ? productos.map((p: any, i: number) => <tr key={i}><td><code>{p.codigo}</code></td><td><strong>{p.descripcion}</strong></td><td>{Number(p.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td><td>{p.ventas}</td><td className="price">$ {Number(p.importe).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td><td className="price">$ {Number(p.costo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td><td className="price">$ {(Number(p.importe) - Number(p.costo)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>) : rows.map((r, i) => <tr key={i}><td><strong>{r.concepto}</strong></td><td>{r.persona}</td><td>{r.extra || ''}</td><td className="price">$ {Number(r.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td><td className="price">$ {Number(r.resultado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>)}</tbody></table>{!porProducto && !rows.length && <div className="empty-table">No hay datos en el período seleccionado.</div>}{porProducto && !prodLoading && !productos.length && <div className="empty-table">No hay ventas confirmadas de productos en el período.</div>}</div><div className="report-total">{porProducto ? <>Ventas de productos del período: <strong>$ {totalProd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong> · {Number(prodTotales.unidades || 0).toLocaleString('es-AR')} unidades</> : <>Resultado del período: <strong>$ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></>}</div></div>;
}