import { useState, useEffect } from "react";
import { LayoutGrid, List } from "lucide-react";
import { api, erpApi } from "../../services/api";
import { fmtFecha } from "../../utils/fecha";
import { DocumentDetail } from "../shared/DocumentDetail";
import { DynamicGroupingReport } from "../shared/DynamicGroupingReport";

// La pestaña usa el texto que se ve en el menú; el backend guarda otro código.
const TIPO_BACKEND: Record<string, string> = {
  'NOTA DE VENTA X': 'NOTA_X',
  'RESERVA': 'RESERVA',
  'NOTA DE PEDIDO': 'NOTA_PEDIDO',
  'REMITO': 'REMITO',
};

export function OperationalDocumentsPage({ tipo, onNavigate }: { tipo: string; onNavigate?: (page: string) => void }) {
  const tipoBackend = TIPO_BACKEND[tipo] || tipo;
  const [rows, setRows] = useState<any[]>([]);
  const [pvs, setPvs] = useState<number[]>([]);
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState('');
  const [pv, setPv] = useState('');
  const [expanded, setExpanded] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [vista, setVista] = useState<'agrupado' | 'lista'>('lista');
  const [remitoSub, setRemitoSub] = useState<'R' | 'X'>('X');
  const [remitoViaNotaPedido, setRemitoViaNotaPedido] = useState(true);

  async function load() {
    setError('');
    try {
      const r = await api.listDocuments(tipoBackend);
      const mapped = (r.documentos || []).map((d: any) => ({
        id: d.id,
        fecha: d.fecha || d.created_at,
        numero: `${String(d.punto_venta || 1).padStart(4, '0')}-${String(d.numero || 0).padStart(8, '0')}`,
        pv: Number(d.punto_venta || 0),
        cliente: d.cliente_nombre || 'CONSUMIDOR FINAL',
        cliente_id: d.cliente_id || null,
        condicion_venta: d.condicion_venta || 'CONTADO',
        vendedor: d.vendedor_nombre || '-',
        estado: d.estado,
        subtipo: d.subtipo, canal: d.canal,
        total: d.importe_total || 0,
        items: d.items || [],
      }));
      setRows(mapped);
      setPvs(Array.from(new Set(mapped.map((x: any) => x.pv).filter(Boolean))).sort((a: number, b: number) => a - b));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [tipoBackend]);
  useEffect(() => { api.getCompanySettings().then((r: any) => setRemitoViaNotaPedido(r.settings?.remitoRequiereNotaPedido !== false)).catch(() => {}); }, []);

  const filtered = rows.filter((r: any) =>
    String(r.fecha).slice(0, 10) >= from &&
    String(r.fecha).slice(0, 10) <= to &&
    (!pv || Number(r.pv) === Number(pv)) &&
    `${r.cliente} ${r.numero} ${r.vendedor || ''}`.toLowerCase().includes(q.toLowerCase())
  );

  // Solo Nota de Pedido tiene, hoy, un circuito de backend real para generar
  // remito y cancelar (workflow de documentos_comerciales). Para las demás
  // pestañas dejamos la lista (ya con datos reales) pero sin estas acciones,
  // en vez de simular algo que no pasa nada en el servidor.
  const permiteAcciones = tipo === 'NOTA DE PEDIDO';

  // Nota de venta, nota de pedido y remito R pueden cargarse en el POS para
  // facturarse, igual que los presupuestos: el cliente queda fijo y la factura
  // queda relacionada al documento de origen.
  const permiteFacturar = ['NOTA DE VENTA X', 'NOTA DE PEDIDO', 'REMITO'].includes(tipo);

  async function cargarEnVenta(r: any, navegar: boolean) {
    setBusy(r.id);
    setError('');
    setNotice('');
    try {
      const items = (r.items || []).map((i: any) => ({ id: i.producto_id || null, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad || 'UN', cantidad: Number(i.cantidad), precio: Math.round(Number(i.precio_unitario || 0) * 10000) / 10000, descuento: Number(i.descuento || 0), iva: Number(i.iva || 21), costo: 0 }));
      if (!items.length) throw new Error('El documento no tiene ítems para cargar.');
      const draft = await erpApi.getPosDrafts();
      const prev = Array.isArray(draft.draft?.tabs) ? draft.draft.tabs : [];
      const customer = { query: r.cliente || 'CONSUMIDOR FINAL', selected: r.cliente_id ? { id: r.cliente_id, razonSocial: r.cliente } : null };
      const loaded = { cart: items, customer, paymentCondition: String(r.condicion_venta || 'CONTADO').replaceAll('_', ' '), notes: '', mode: 'NORMAL', sellerId: null, branchId: null, cashierId: null, reserveFundId: null, facturaAsociadaId: null, clienteBloqueado: true, origenDocumentoId: r.id };
      const activeId = Number(draft.draft?.activeTab) || (prev[0] && Number(prev[0].id)) || 1;
      let targetId = activeId;
      if (prev.length) {
        const vacia = prev.find((t: any) => Array.isArray(t.cart) && t.cart.length === 0);
        if (vacia && Number(vacia.id) !== activeId) {
          const etiqueta = tipo === 'REMITO' ? 'Remito R' : tipo === 'NOTA DE PEDIDO' ? 'Nota de pedido' : 'Nota de venta';
          if (confirm(`Hay una venta vacía (${vacia.label || `Venta ${vacia.id}`}). ¿Agregar ${etiqueta} ${r.numero} en esa venta?`)) targetId = Number(vacia.id);
        }
      }
      let tabs;
      if (prev.length) {
        tabs = prev.map((t: any, i: number) => i < 4 && t.id === targetId ? { ...t, label: `Venta ${t.id}`, ...loaded } : i < 4 ? { ...t, label: `Venta ${t.id}` } : t);
      } else {
        tabs = [1, 2, 3, 4].map(id => ({ id, label: `Venta ${id}`, cart: [], customer: { query: "CONSUMIDOR FINAL", selected: null }, paymentCondition: "CONTADO", notes: "", mode: "NORMAL", sellerId: null, branchId: null, cashierId: null, reserveFundId: null, facturaAsociadaId: null, clienteBloqueado: false, origenDocumentoId: null }));
        tabs = tabs.map(t => t.id === targetId ? { ...t, ...loaded, label: `Venta ${t.id}` } : t);
      }
      const etiqueta = tipo === 'REMITO' ? 'Remito R' : tipo === 'NOTA DE PEDIDO' ? 'Nota de pedido' : 'Nota de venta';
      await erpApi.savePosDrafts({ tabs, activeTab: targetId });
      if (navegar) onNavigate?.('pos');
      else setNotice(`${etiqueta} ${r.numero} cargado en la venta activa. Entrá a Punto de venta para facturarlo.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function generarRemito(r: any) {
    setBusy(r.id);
    setError('');
    try {
      await api.convertDocument(r.id, 'REMITO', { subtipo: remitoSub });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function cancelar(r: any) {
    setBusy(r.id);
    setError('');
    try {
      await api.changeDocumentStatus(r.id, 'ANULADO');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function verPdf(r: any) {
    setBusy(r.id);
    setError('');
    try {
      await api.generarDocumentoPdf(r.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>{tipo}</h3><p>Buscador por fechas, detalle de ítems y acciones operativas.</p></div>
      <button className="secondary-action" onClick={() => setVista(v => v === 'agrupado' ? 'lista' : 'agrupado')}>{vista === 'agrupado' ? <><List size={16} /> Vista lista</> : <><LayoutGrid size={16} /> Vista agrupada</>}</button>
    </div>
    <div className="report-filters">
      <label>Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>Hasta<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      {pvs.length > 1 && <label>Punto de venta<select value={pv} onChange={e => setPv(e.target.value)}><option value="">Todos</option>{pvs.map(p => <option key={p} value={p}>PV {String(p).padStart(4, '0')}</option>)}</select></label>}
      <label>Buscar<input value={q} onChange={e => setQ(e.target.value)} placeholder="Cliente, número o vendedor" /></label>
    </div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    {vista === 'agrupado'
      ? <DynamicGroupingReport rows={filtered} />
      : <div className="products-card expandable-table">
      <table>
        <thead><tr><th></th><th>Fecha</th><th>Número</th><th>Cliente</th><th>Vendedor</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>
        <tbody>{filtered.map((r: any) => <>
          <tr key={r.id}>
            <td><button onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{expanded === r.id ? '−' : '+'}</button></td>
            <td>{fmtFecha(r.fecha)}</td>
            <td><strong>{r.numero}{tipo === 'REMITO' && r.subtipo ? <span className="subtipo-badge">{r.subtipo}</span> : null}{r.canal === 'WHATSAPP' ? <span className="subtipo-badge wa-badge">WHATSAPP</span> : null}</strong></td>
            <td>{r.cliente}</td>
            <td>{r.vendedor}</td>
            <td>{r.estado}</td>
            <td className="price">$ {Number(r.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            <td><div className="inline-actions">
              <button disabled={busy === r.id} title="Ver el PDF / reimprimir" onClick={() => verPdf(r)}>PDF</button>
              {permiteAcciones && remitoViaNotaPedido && r.estado === 'BORRADOR' && <>
                <select value={remitoSub} onChange={e => setRemitoSub(e.target.value as 'R' | 'X')} title="Tipo de remito: R para facturar después, X para movimiento interno">
                  <option value="R">Remito R</option>
                  <option value="X">Remito X</option>
                </select>
                <button disabled={busy === r.id} onClick={() => generarRemito(r)}>Generar remito</button>
              </>}
              {permiteFacturar && ['BORRADOR', 'CONFIRMADO', 'ENVIADO', 'ACEPTADO', 'REMITIDO'].includes(r.estado) && (tipo !== 'REMITO' || r.subtipo === 'R') && <>
                <button disabled={busy === r.id} onClick={() => cargarEnVenta(r, false)}>Agregar en venta</button>
                <button disabled={busy === r.id} onClick={() => cargarEnVenta(r, true)}>Facturar</button>
              </>}
              {permiteAcciones && r.estado !== 'ANULADO' && <button disabled={busy === r.id} onClick={() => cancelar(r)}>Cancelar</button>}
            </div></td>
          </tr>
          {expanded === r.id && <tr className="detail-row"><td colSpan={8}>
            <DocumentDetail id={r.id} />
          </td></tr>}
        </>)}</tbody>
      </table>
      {!filtered.length && <div className="empty-table">No hay documentos para mostrar.</div>}
    </div>}
  </div>;
}
