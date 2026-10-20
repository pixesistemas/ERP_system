import { useState, useEffect, Fragment } from "react";
import { FileText, RefreshCw, LayoutGrid, List, Download, Printer } from "lucide-react";
import { api, normalizarUrlArchivo } from "../../services/api";
import { DocumentDetail } from "../shared/DocumentDetail";
import { DynamicGroupingReport } from "../shared/DynamicGroupingReport";
import { PdfViewerModal } from "../shared/PdfViewerModal";

export function DocumentsPage({ tipo = "" }: { tipo?: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterTipo, setFilterTipo] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterCanal, setFilterCanal] = useState("");
  const [filterCliente, setFilterCliente] = useState("");
  const [filterPv, setFilterPv] = useState("");
  const [expanded, setExpanded] = useState<any>(null);
  const [vista, setVista] = useState<'agrupado' | 'lista'>('lista');
  const [pdfModal, setPdfModal] = useState<{ url: string; title: string } | null>(null);

  async function load() {
    try {
      setError("");
      const r = await api.listDocuments(tipo);
      setRows(r.documentos || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [tipo]);

  async function pdf(id: number) {
    try {
      const r = await api.generateDocumentPdf(id);
      const raw = r.pdf?.publicUrl || r.pdf?.url || r.documento?.pdf_url || r.pdfUrl;
      const url = normalizarUrlArchivo(raw);
      if (url) setPdfModal({ url, title: "Comprobante PDF" });
      else alert('El PDF fue generado, pero no se recibió una URL.');
    } catch (e: any) {
      setError(e.message);
    }
  }

  const tipos = Array.from(new Set(rows.map((d: any) => d.tipo).filter(Boolean))).sort();
  const estados = Array.from(new Set(rows.map((d: any) => d.estado).filter(Boolean))).sort();
  const canales = Array.from(new Set(rows.map((d: any) => d.canal || "WEB").filter(Boolean))).sort();
  const pvs = Array.from(new Set(rows.map((d: any) => Number(d.punto_venta || 0)).filter(Boolean))).sort((a, b) => a - b);

  const visible = rows.filter(d => {
    const fecha = String(d.created_at || '').slice(0, 10);
    if (fecha < from || fecha > to) return false;
    if (filterTipo && d.tipo !== filterTipo) return false;
    if (filterEstado && d.estado !== filterEstado) return false;
    if (filterCanal && (d.canal || "WEB") !== filterCanal) return false;
    if (filterCliente && !String(d.cliente_nombre || d.cliente || "").toLowerCase().includes(filterCliente.toLowerCase())) return false;
    if (filterPv && Number(d.punto_venta || 0) !== Number(filterPv)) return false;
    return true;
  });

  const estadoAfip = (d: any) => d.afip_estado || (d.cae ? "AUTORIZADO" : "—");

  const CABECERAS_EXPORT = ["Fecha", "Tipo", "Número", "Cliente", "Vendedor", "Cond. pago", "Estado", "Estado AFIP", "CAE", "Total", "Canal"];

  function filasExportacion() {
    return visible.map((d: any) => [
      new Date(d.created_at).toLocaleString("es-AR"),
      d.tipo === "REMITO" ? `REMITO ${d.subtipo || "X"}` : d.tipo || "",
      `${String(d.punto_venta || 1).padStart(4, "0")}-${String(d.numero || 0).padStart(8, "0")}`,
      d.cliente_nombre || d.cliente || "CONSUMIDOR FINAL",
      d.vendedor_nombre || "—",
      String(d.condicion_venta || "CONTADO").replaceAll("_", " "),
      d.estado || "",
      estadoAfip(d),
      d.cae || "—",
      Number(d.total || d.importe_total || 0),
      d.canal || "WEB",
    ]);
  }

  function descargarArchivo(nombre: string, contenido: string, mime: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([contenido], { type: mime }));
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportarExcel() {
    const filas = filasExportacion();
    const total = filas.reduce((n, f) => n + Number(f[9] || 0), 0);
    const esc = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${CABECERAS_EXPORT.map((h) => `<th>${h}</th>`).join("")}</tr>${filas.map((f) => `<tr>${f.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}<tr><td colspan="9"><strong>TOTAL</strong></td><td>${total.toFixed(2)}</td><td></td></tr></table></body></html>`;
    descargarArchivo(`comprobantes-${from}-${to}.xls`, html, "application/vnd.ms-excel");
  }

  function exportarPdf() {
    const filas = filasExportacion();
    const total = filas.reduce((n, f) => n + Number(f[9] || 0), 0);
    const esc = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const w = window.open("", "_blank");
    if (!w) return;
    const cuerpo = filas.map((f) => `<tr>${f.map((c, i) => `<td class="${i === 9 ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("");
    w.document.write(`<html><head><meta charset="utf-8"><title>Comprobantes comerciales</title><style>
      @page{size:A4 landscape;margin:8mm}
      body{font-family:Arial;font-size:9px;color:#111}
      h1{font-size:15px;margin:0 0 3px}
      .sub{font-size:10px;color:#444;margin-bottom:8px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #b9b9c9;padding:3px 5px;text-align:left;line-height:1.25}
      th{background:#2E3A59;color:#fff;text-transform:uppercase;font-size:8px}
      td.num{text-align:right}
      tr:last-child td{font-weight:700;background:#DCE7F7}
      thead{display:table-header-group}
    </style></head><body>
      <h1>${tipo === "PRESUPUESTO" ? "Presupuestos" : "Comprobantes comerciales"}</h1>
      <div class="sub">Desde ${from} hasta ${to} · ${filas.length} comprobante(s)</div>
      <table><thead><tr>${CABECERAS_EXPORT.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${cuerpo}<tr><td colspan="9">TOTAL</td><td class="num">$ ${total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr></tbody></table>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  const estadoAfipClass = (d: any) => d.afip_estado === "AUTORIZADO" ? "fiscal-ok" : d.afip_estado === "PENDIENTE" ? "fiscal-warn" : d.afip_estado === "RECHAZADO" ? "fiscal-bad" : "";
  const obsArca = (obs: any): any[] => {
    if (!obs) return [];
    if (Array.isArray(obs)) return obs;
    if (typeof obs === "string") {
      try {
        const p = JSON.parse(obs);
        if (Array.isArray(p)) return p;
        if (p && Array.isArray(p.Obs)) return p.Obs;
      } catch { /* no es JSON */ }
      return [{ Code: "—", Msg: obs }];
    }
    if (obs.Obs) return obs.Obs;
    return [{ Code: "—", Msg: String(obs.Msg || JSON.stringify(obs)) }];
  };

  return <div className="products-page">
    <div className="products-toolbar">
      <div>
        <h3>{tipo === 'PRESUPUESTO' ? 'Presupuestos' : 'Comprobantes comerciales'}</h3>
        <p>Detalle de ítems, PDF y filtros por fecha, tipo, estado, canal y cliente.</p>
      </div>
      <button className="secondary-action" onClick={exportarExcel}><Download size={16} /> Excel</button>
      <button className="secondary-action" onClick={exportarPdf}><Printer size={16} /> PDF</button>
      <button className="primary-action" onClick={load}><RefreshCw size={18} /> Actualizar</button>
      <button className="secondary-action" onClick={() => setVista(v => v === 'agrupado' ? 'lista' : 'agrupado')}>{vista === 'agrupado' ? <><List size={16} /> Vista lista</> : <><LayoutGrid size={16} /> Vista agrupada</>}</button>
    </div>
    <div className="report-filters">
      <label>Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>Hasta<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      {tipos.length > 1 && <label>Tipo<select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}><option value="">Todos</option>{tipos.map(t => <option key={t} value={t}>{t === "REMITO" ? "Remito (X y R)" : t}</option>)}</select></label>}
      {estados.length > 1 && <label>Estado<select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}><option value="">Todos</option>{estados.map(s => <option key={s} value={s}>{s}</option>)}</select></label>}
      {canales.length > 1 && <label>Canal<select value={filterCanal} onChange={e => setFilterCanal(e.target.value)}><option value="">Todos</option>{canales.map(c => <option key={c} value={c}>{c}</option>)}</select></label>}
      {pvs.length > 1 && <label>Punto de venta<select value={filterPv} onChange={e => setFilterPv(e.target.value)}><option value="">Todos</option>{pvs.map(p => <option key={p} value={p}>PV {String(p).padStart(4, '0')}</option>)}</select></label>}
      <label>Cliente<input type="text" value={filterCliente} onChange={e => setFilterCliente(e.target.value)} placeholder="Buscar cliente..." /></label>
    </div>
    {error && <div className="error-box">{error}</div>}
    {vista === 'agrupado'
      ? <DynamicGroupingReport rows={visible.map((d: any) => ({
          id: d.id,
          fecha: d.fecha || d.created_at,
          numero: `${String(d.punto_venta || 1).padStart(4, '0')}-${String(d.numero || 0).padStart(8, '0')}`,
          pv: Number(d.punto_venta || 1),
          cliente: d.cliente_nombre || d.cliente || 'CONSUMIDOR FINAL',
          vendedor: d.vendedor_nombre || '-',
          estado: d.estado,
          total: Number(d.total || d.importe_total || 0),
          items: d.items || [],
        }))} />
      : <div className="products-card expandable-table">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Número</th>
            <th>Cliente</th>
            <th>Vendedor</th>
            <th>Cond. pago</th>
            <th>Estado</th>
            <th>Estado AFIP</th>
            <th>CAE</th>
            <th>Total</th>
            <th>Canal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((d: any) => <Fragment key={d.id}>
            <tr>
              <td><button onClick={() => setExpanded(expanded === d.id ? null : d.id)}>{expanded === d.id ? '−' : '+'}</button></td>
              <td>{new Date(d.created_at).toLocaleString('es-AR')}</td>
              <td><strong>{d.tipo === "REMITO" ? `REMITO ${d.subtipo || "X"}` : d.tipo}</strong>{d.comprobante_letra && <small style={{ display: "block", color: "#555" }}>{d.comprobante_letra} {d.comprobante_tipo_afip ? `Cod.${d.comprobante_tipo_afip}` : ''}</small>}</td>
              <td>{String(d.punto_venta || 1).padStart(4, '0')}-{String(d.numero || 0).padStart(8, '0')}{d.documento_origen_tipo && <small className="doc-relacionado">Relacionado: {d.documento_origen_tipo} {String(d.documento_origen_punto_venta || 1).padStart(4, '0')}-{String(d.documento_origen_numero || 0).padStart(8, '0')}</small>}</td>
              <td>{d.cliente_nombre || d.cliente || 'CONSUMIDOR FINAL'}</td>
              <td>{d.vendedor_nombre || '—'}</td>
              <td>{String(d.condicion_venta || 'CONTADO').replaceAll('_', ' ')}</td>
              <td>{d.estado}</td>
              <td><span className={estadoAfipClass(d)}>{estadoAfip(d)}</span>{d.afip_observaciones && <details className="afip-obs"><summary>Ver observación</summary><div className="obs-arca">{obsArca(d.afip_observaciones).map((o: any, i: number) => <div className="obs-arca-line" key={i}><b>Obs {o.Code}</b><span>{o.Msg}</span></div>)}</div></details>}</td>
              <td>{d.cae ? <small>{d.cae}</small> : '—'}</td>
              <td className="price">$ {Number(d.total || d.importe_total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
              <td>{d.canal || 'WEB'}</td>
              <td><div className="inline-actions">
                <button onClick={() => pdf(d.id)}><FileText size={16} /> Ver PDF</button>
              </div></td>
            </tr>
            {expanded === d.id && <tr className="detail-row"><td colSpan={13}><DocumentDetail id={d.id} /></td></tr>}
          </Fragment>)}
        </tbody>
      </table>
      {!visible.length && <div className="empty-table">No hay documentos para mostrar.</div>}
    </div>}
    {pdfModal && <PdfViewerModal url={pdfModal.url} title={pdfModal.title} onClose={() => setPdfModal(null)} />}
  </div>;
}
