import { useState, useEffect, useRef } from "react";
import { Printer, Plus, Trash2, X, CheckSquare, Send } from "lucide-react";
import { api, erpApi } from "../../services/api";

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtFecha = (s: string) => { const d = new Date(`${String(s).slice(0, 10)}T00:00:00`); return isNaN(d.getTime()) ? (s || '—') : d.toLocaleDateString('es-AR'); };

export function CobroTemporalPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [importe, setImporte] = useState("");
  const [observacion, setObservacion] = useState("");
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchSeq = useRef(0);
  const clientRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    try {
      const r = await erpApi.listCobrosTemporales();
      setRows(r.cobros || []);
      setMarcados(new Set());
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function searchClients(text: string) {
    setClientQuery(text);
    setSelected(null);
    if (text.trim().length < 2) { setSuggestions([]); return; }
    const local = clients.filter(c => `${c.razonSocial} ${c.cuit || ""} ${c.dni || ""} ${c.telefono || ""}`.toLowerCase().includes(text.toLowerCase())).slice(0, 12);
    if (local.length) { setSuggestions(local); return; }
    const seq = ++searchSeq.current;
    const r = await api.listClients(text);
    if (seq !== searchSeq.current) return;
    setClients(prev => [...prev, ...(r.clientes || [])]);
    setSuggestions(r.clientes?.slice(0, 12) || []);
  }

  function selectClient(c: any) {
    setSelected(c);
    setClientQuery(c.razonSocial);
    setSuggestions([]);
    clientRef.current?.focus();
  }

  async function agregar() {
    setError("");
    if (!selected) { setError("Buscá y seleccioná un cliente de la lista."); return; }
    const monto = Number(importe);
    if (!(monto > 0)) { setError("El importe debe ser mayor a 0."); return; }
    setBusy(true);
    try {
      await erpApi.createCobroTemporal({ cliente_id: selected.id, cliente_nombre: selected.razonSocial, importe: monto, observacion });
      setImporte("");
      setObservacion("");
      setSelected(null);
      setClientQuery("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function eliminar(id: number) {
    if (!confirm("¿Eliminar este cobro temporal pendiente?")) return;
    setError("");
    try {
      await erpApi.deleteCobroTemporal(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function toggleMarcado(id: number) {
    setMarcados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function enviarCuentaCorriente() {
    const ids = rows.filter(r => r.estado === 'PENDIENTE' && marcados.has(r.id)).map(r => r.id);
    if (!ids.length) { setError("Marcá al menos un cobro pendiente para enviar a cuenta corriente."); return; }
    if (!confirm(`¿Enviar ${ids.length} cobro(s) por $ ${fmt(rows.filter(r => marcados.has(r.id)).reduce((n, r) => n + Number(r.importe), 0))} a la cuenta corriente de cada cliente?`)) return;
    setError("");
    setBusy(true);
    try {
      const r = await erpApi.enviarCobrosCuentaCorriente(ids);
      await load();
      setError(`Enviados ${r.cobros?.length || ids.length} cobro(s) a cuenta corriente. Se pueden ver en Clientes → Cuentas clientes.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function imprimir() {
    const pendientes = rows.filter(r => r.estado === 'PENDIENTE');
    const total = pendientes.reduce((n, r) => n + Number(r.importe), 0);
    const filas = pendientes.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${fmtFecha(r.created_at)}</td>
        <td>${(r.cliente_nombre || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
        <td style="text-align:right">$ ${fmt(r.importe)}</td>
        <td>${(r.observacion || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
      </tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><meta charset="utf-8"><title>Cobros temporales</title><style>
      @page{size:A4;margin:12mm}
      body{font-family:Arial;font-size:12px;color:#222}
      h1{font-size:18px;margin:0 0 2px}
      p{margin:2px 0}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #999;padding:6px 8px}
      th{background:#3B3555;color:#fff;text-align:left}
      td:nth-child(4){text-align:right}
      .tot{background:#EFEAF9;font-weight:bold}
      .firmas{margin-top:60px;display:flex;justify-content:space-between}
      .firma{text-align:center}
      .firma div{width:180px;border-top:1px solid #333;margin-top:34px;padding-top:4px}
    </style></head><body>
      <h1>Cobros temporales para gestión de cobranzas</h1>
      <p>Emitido el ${new Date().toLocaleDateString('es-AR')} · ${pendientes.length} ${pendientes.length === 1 ? 'cobro' : 'cobros'} pendientes</p>
      <table>
        <thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Importe</th><th>Observación</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="5">Sin cobros pendientes</td></tr>'}
          <tr class="tot"><td colspan="3">TOTAL A COBRAR</td><td>$ ${fmt(total)}</td><td></td></tr>
        </tbody>
      </table>
      <div class="firmas">
        <div class="firma"><div>Entregué conforme (vendedor)</div></div>
        <div class="firma"><div>Recibí conforme (cliente)</div></div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 250);
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Cobro temporal</h3><p>Cargá cobros en la grilla para imprimir y repartir entre los vendedores; después marcá los cobrados y enviálos a la cuenta corriente del cliente.</p></div>
      <div className="inline-actions">
        <button className="secondary-action" onClick={imprimir}><Printer size={16} /> Imprimir pendientes</button>
        <button className="primary-action" onClick={enviarCuentaCorriente} disabled={busy}><Send size={16} /> Enviar marcados a cuenta corriente</button>
      </div>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="products-card cobro-form-card">
      <div className="cobro-form">
        <label className="autocomplete-wrap">CLIENTE<input ref={clientRef} value={clientQuery} onChange={e => searchClients(e.target.value)} placeholder="Buscar nombre, CUIT o DNI..." />
          {suggestions.length > 0 && <div className="autocomplete-menu">{suggestions.map(c => <button key={c.id} onClick={() => selectClient(c)}><strong>{c.razonSocial}</strong><small>{c.cuit || c.dni || "Sin documento"}</small></button>)}</div>}
        </label>
        <label>IMPORTE<input type="number" step="0.01" min="0" value={importe} onChange={e => setImporte(e.target.value)} placeholder="0.00" onKeyDown={e => e.key === 'Enter' && agregar()} /></label>
        <label>OBSERVACIÓN<input value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Ej.: Cobro de saldo de mayo" onKeyDown={e => e.key === 'Enter' && agregar()} /></label>
        <button className="primary-action" onClick={agregar} disabled={busy}><Plus size={16} /> Agregar</button>
      </div>
    </div>
    <div className="products-card expandable-table">
      <table>
        <thead><tr><th></th><th>N°</th><th>Fecha</th><th>Cliente</th><th>Importe</th><th>Observación</th><th>Estado</th><th></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} className={r.estado === 'CUENTA_CORRIENTE' ? 'row-cc' : ''}>
          <td>{r.estado === 'PENDIENTE' ? <input type="checkbox" checked={marcados.has(r.id)} onChange={() => toggleMarcado(r.id)} title="Marcar para enviar a cuenta corriente" /> : <CheckSquare size={15} className="muted" />}</td>
          <td><strong>{r.id}</strong></td>
          <td>{fmtFecha(r.created_at)}</td>
          <td>{r.cliente_nombre}</td>
          <td className="price">$ {fmt(r.importe)}</td>
          <td>{r.observacion || <span className="muted">—</span>}</td>
          <td>{r.estado === 'PENDIENTE' ? 'PENDIENTE' : <span className="badge success">CUENTA CORRIENTE</span>}</td>
          <td>{r.estado === 'PENDIENTE' && <button onClick={() => eliminar(r.id)}><Trash2 size={16} /></button>}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <div className="empty-table">No hay cobros cargados. Agregá uno arriba.</div>}
    </div>
  </div>;
}