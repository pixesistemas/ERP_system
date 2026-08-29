import { useState, useEffect } from "react";
import { Printer, FileSpreadsheet } from "lucide-react";
import { api, erpApi } from "../../services/api";
import { DynamicGroupingReport, DIMS, buildLines, type DocRow } from "../shared/DynamicGroupingReport";

const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DynamicOrdersReportPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [posRows, setPosRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [levels, setLevels] = useState<string[]>([]);
  const [dragDim, setDragDim] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [r, p] = await Promise.all([
        api.listDocuments('NOTA_PEDIDO').catch(() => ({ documentos: [] })),
        erpApi.listPosOperations().catch(() => ({ operations: [] })),
      ]);
      const docs = (r.documentos || []).filter((d: any) => String(d.canal || '').toUpperCase() !== 'POS' && String(d.estado || '').toUpperCase() !== 'ANULADO');
      const ops = (p.operations || []).filter((o: any) => /PEDIDO|RESERVA/i.test(String(o.tipo)) && !/ANULADO/i.test(String(o.estado)));
      const opsConItems = await Promise.all(ops.map(async (o: any) => {
        try {
          const ir = await erpApi.listPosOperationItems(o.id);
          const items = (ir.items || []).map((i: any) => ({ codigo: i.codigo, descripcion: i.descripcion, cantidad: i.cantidad, total: i.total != null ? i.total : i.subtotal }));
          return items.length ? { ...o, items } : o;
        } catch {
          return o;
        }
      }));
      setRows(docs);
      setPosRows(opsConItems);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const enRango = (x: any) => {
    const fecha = String(x.fecha || x.created_at || '').slice(0, 10);
    return fecha >= from && fecha <= to;
  };

  const docRows: DocRow[] = [
    ...rows.filter(enRango).map((d: any) => ({
      id: d.id,
      fecha: String(d.fecha || d.created_at || '').slice(0, 10),
      fechaEntrega: String(d.fecha_entrega || '').slice(0, 10),
      fechaAnulacion: String(d.fecha_anulacion || '').slice(0, 10),
      numero: `${String(d.punto_venta || 1).padStart(4, '0')}-${String(d.numero || 0).padStart(8, '0')}`,
      pv: Number(d.punto_venta || 1),
      cliente: d.cliente_nombre || d.cliente || 'CONSUMIDOR FINAL',
      vendedor: d.vendedor_nombre || '-',
      estado: d.estado || '',
      canal: 'WEB',
      total: Number(d.importe_total || 0),
      items: (d.items || []).map((i: any) => ({
        codigo: i.codigo,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        total: i.total != null ? i.total : i.subtotal,
      })),
    })),
    ...posRows.filter(enRango).map((o: any) => ({
      id: o.id,
      fecha: String(o.fecha || o.created_at || '').slice(0, 10),
      fechaEntrega: '',
      fechaAnulacion: '',
      numero: `${String(o.punto_venta || 1).padStart(4, '0')}-${String(o.numero || 0).padStart(8, '0')}`,
      pv: Number(o.punto_venta || 1),
      cliente: o.cliente || 'CONSUMIDOR FINAL',
      vendedor: o.vendedor_nombre || '-',
      estado: o.estado || 'CONFIRMADA',
      canal: 'POS',
      total: Number(o.total || 0),
      items: o.items && o.items.length ? o.items : [{ codigo: '', descripcion: `${o.tipo} ${o.numero}`, cantidad: 1, total: Number(o.total || 0) }],
    })),
  ];

  const disponibles = Object.keys(DIMS);

  function soltarDim(key: string) {
    if (key && DIMS[key]) setLevels(prev => prev.includes(key) ? prev : [...prev, key]);
  }

  function htmlGrupos(dims: string[], lines: any[], depth: number): string {
    if (depth >= dims.length) return "";
    const d = DIMS[dims[depth]];
    const keys = [...new Set(lines.map((l: any) => d.value(l)))].sort((a: any, b: any) => a.localeCompare(b, "es"));
    let html = "";
    for (const k of keys) {
      const sub = lines.filter((l: any) => d.value(l) === k);
      const cant = sub.reduce((n: number, l: any) => n + (l.anulado ? -l.cant : l.cant), 0);
      const imp = sub.reduce((n: number, l: any) => n + (l.anulado ? -l.imp : l.imp), 0);
      html += `<tr><td colspan="6" style="${depth === 0 ? 'background:#EFEAF9;' : ''}font-weight:bold">${'&nbsp;&nbsp;&nbsp;'.repeat(depth)}${d.label}: ${k}</td><td style="text-align:right">${cant.toLocaleString('es-AR')}</td><td style="text-align:right">$ ${fmt(imp)}</td></tr>`;
      if (depth + 1 < dims.length) {
        html += htmlGrupos(dims, sub, depth + 1);
      }
    }
    return html;
  }

  function buildExportHtml(): string {
    const lines = buildLines(docRows);
    const totCant = lines.reduce((n, l) => n + (l.anulado ? -l.cant : l.cant), 0);
    const totImp = lines.reduce((n, l) => n + (l.anulado ? -l.imp : l.imp), 0);
    const cuerpo = levels.length ? htmlGrupos(levels, lines, 0)
      : lines.map(l => `<tr style="${l.anulado ? 'color:#C0392B' : ''}"><td>${l.fecha}</td><td>${l.fechaEntrega || '—'}</td><td>${l.fechaAnulacion || '—'}</td><td>${l.numero}</td><td>${l.cliente}</td><td>${l.anulado ? 'ANULADO' : (l.estado || '—')}</td><td style="text-align:right">${(l.anulado ? -l.cant : l.cant).toLocaleString('es-AR')}</td><td style="text-align:right">$ ${fmt(l.anulado ? -l.imp : l.imp)}</td></tr>`).join('');
    return `<html><head><meta charset="utf-8"><style>
      @page{size:A4 landscape;margin:7mm}
      body{font-family:Arial;font-size:9px;color:#222}
      h1{font-size:14px;margin:0 0 3px}
      p{margin:1px 0}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{border:1px solid #999;padding:2px 4px}
      th{background:#263c52;color:white;text-align:left;position:sticky;top:0}
      thead{display:table-header-group}
      tr{page-break-inside:avoid}
      tbody{page-break-inside:auto}
      td:nth-child(7),td:nth-child(8),th:nth-child(7),th:nth-child(8){text-align:right}
      .tot{background:#4E4A72;color:white;font-weight:bold}
      .tot td{border-color:#4E4A72}
    </style></head><body>
      <h1>Reporte de pedidos dinámicos</h1>
      <p>Desde ${from} hasta ${to}${levels.length ? ` · Agrupado por: ${levels.map(k => DIMS[k].label).join(' → ')}` : ' · Sin agrupar'}</p>
      <table>
        <thead><tr><th>Fecha</th><th>Entrega</th><th>Anulación</th><th>Número</th><th>Cliente</th><th>Estado</th><th>Cantidad</th><th>Importe</th></tr></thead>
        <tbody>${cuerpo || '<tr><td colspan="8">Sin datos</td></tr>'}
          <tr class="tot"><td colspan="6"><b>TOTAL GENERAL (${lines.length} ${lines.length === 1 ? 'línea' : 'líneas'} · ${totCant.toLocaleString('es-AR')} ${totCant === 1 ? 'unidad' : 'unidades'})</b></td><td style="text-align:right"><b>${totCant.toLocaleString('es-AR')}</b></td><td style="text-align:right"><b>$ ${fmt(totImp)}</b></td></tr>
        </tbody>
      </table>
    </body></html>`;
  }

  function printPdf() {
    const w = window.open('', '_blank');
    w?.document.write(buildExportHtml());
    w?.document.close();
    setTimeout(() => w?.print(), 250);
  }

  function exportExcel() {
    const blob = new Blob([buildExportHtml()], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pedidos-dinamicos-${from}-a-${to}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Pedidos dinámicos</h3><p>Notas de pedido (web y POS) agrupadas por arrastrar y soltar, con totales por grupo.</p></div>
      <div className="inline-actions">
        <button className="secondary-action" onClick={exportExcel} disabled={busy}><FileSpreadsheet size={16} /> Excel</button>
        <button className="secondary-action" onClick={printPdf} disabled={busy}><Printer size={16} /> PDF</button>
        <button className="primary-action" onClick={load} disabled={busy}>Actualizar</button>
      </div>
    </div>
    <div className="report-filters">
      <label>Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>Hasta<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
    </div>
    <div className="dd-source">
      <span className="dd-label">Arrastrá campos:</span>
      {disponibles.map(k => <span key={k} className="dd-field" draggable
        onDragStart={e => { e.dataTransfer.setData("text/plain", k); setDragDim(k); }}
        onDoubleClick={() => soltarDim(k)}
        title="Arrastrar a la zona de agrupamiento (o doble clic)">{DIMS[k].label}</span>)}
      {!!levels.length && <button className="secondary-action dd-clear" onClick={() => setLevels([])}>Limpiar agrupamiento</button>}
    </div>
    <div className={`dd-zone${dragOver ? ' drag-over' : ''}`} onDragOver={e => e.preventDefault()}
      onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); soltarDim(e.dataTransfer.getData("text/plain") || dragDim); }}>
      {!levels.length && <span className="dd-hint">Soltó acá los campos para agrupar, en el orden que quieras (ej.: Cliente → Producto → Punto de venta).</span>}
      {levels.map(k => <span key={k} className="dd-chip" draggable
        onDragStart={e => e.dataTransfer.setData("text/plain", k)}
        onClick={() => setLevels(prev => prev.filter(x => x !== k))}
        title="Clic para quitar">{DIMS[k].label} ×</span>)}
    </div>
    {error && <div className="error-box">{error}</div>}
    <DynamicGroupingReport rows={docRows} levels={levels} />
  </div>;
}
