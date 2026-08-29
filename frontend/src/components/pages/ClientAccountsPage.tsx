import { useState, useEffect, Fragment } from "react";
import { fmtFecha } from "../../utils/fecha";
import { ChevronRight, CircleDollarSign, Search, History, BadgeDollarSign, Printer, Plus } from "lucide-react";
import { api } from "../../services/api";
import { Client } from "../../types";
import { MoneyInput } from "../shared/MoneyInput";

export function ClientAccountsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [summaries, setSummaries] = useState<Record<string, { saldo: number; vencido: number; aVencer: number }>>({});
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState<any>({ efectivo: 0, tarjeta: 0, qr: 0, transferencia: 0, cheque: 0 });
  const [receivedChecks, setReceivedChecks] = useState<any[]>([]);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  function calcularVencidos(movs: any[]) {
    const hoy = new Date();
    const pend: { importe: number; dias: number }[] = [];
    let credito = 0;
    const ordenados = [...(movs || [])].sort((a: any, b: any) => new Date(a.created_at || a.fecha).getTime() - new Date(b.created_at || b.fecha).getTime());
    const consumir = (importe: number) => {
      let rest = importe;
      while (rest > 0.004 && pend.length) {
        const p = pend[0];
        const aplicar = Math.min(rest, p.importe);
        p.importe -= aplicar; rest -= aplicar;
        if (p.importe < 0.004) pend.shift();
      }
      return rest;
    };
    for (const m of ordenados) {
      const debe = Number(m.debe || 0), haber = Number(m.haber || 0);
      if (debe > 0) {
        pend.push({ importe: debe, dias: (hoy.getTime() - new Date(m.created_at || m.fecha).getTime()) / 86400000 });
        if (credito > 0.004) credito = consumir(credito);
      }
      if (haber > 0) {
        credito += haber;
        credito = consumir(credito);
      }
    }
    let vencido = 0, aVencer = 0;
    for (const p of pend) { if (p.dias > 30) vencido += p.importe; else aVencer += p.importe; }
    return { vencido, aVencer };
  }

  useEffect(() => {
    api.listClients("").then(async r => {
      const cs = r.clientes || [];
      setClients(cs);
      const pairs = await Promise.all(cs.filter((c: Client) => c.cuit || c.dni).map(async (c: Client) => {
        try {
          const x = await api.getClientAccount(c.cuit || c.dni || "");
          const v = calcularVencidos(x.movimientos || []);
          return [String(c.id), { saldo: Number(x.saldo || 0), vencido: v.vencido, aVencer: v.aVencer }];
        }
        catch { return [String(c.id), { saldo: 0, vencido: 0, aVencer: 0 }]; }
      }));
      setSummaries(Object.fromEntries(pairs));
    }).catch((e: any) => setError(e.message));
  }, []);

  const filtered = clients.filter(c => `${c.razonSocial} ${c.cuit || ""} ${c.dni || ""}`.toLowerCase().includes(query.toLowerCase()));
  const totalPayment = Object.values(payments as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0);
  const checksTotal = receivedChecks.reduce((n, c) => n + Number(c.importe || 0), 0);
  const checksMismatch = Number(payments.cheque || 0) > 0 && Math.abs(checksTotal - Number(payments.cheque || 0)) > 0.009;

  async function consult(c: Client) {
    try {
      setSelected(c);
      setData(await api.getClientAccount(c.cuit || c.dni || ""));
      setPayments({ efectivo: 0, tarjeta: 0, qr: 0, transferencia: 0, cheque: 0 });
      setReceivedChecks([]);
    } catch (e: any) { setError(e.message); }
  }

  function exportarSaldos(soloVencidos: boolean) {
    const filas = clients
      .filter((c) => c.cuit || c.dni)
      .map((c) => ({ c, s: summaries[String(c.id)] || { saldo: 0, vencido: 0, aVencer: 0 } }))
      .filter((x) => (soloVencidos ? Number(x.s.vencido) > 0 : Number(x.s.saldo) > 0))
      .sort((a, b) => Number(b.s.saldo) - Number(a.s.saldo));
    if (!filas.length) { setError(soloVencidos ? "No hay saldos vencidos mayores a 30 días." : "No hay clientes con deuda."); return; }
    const c = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lineas = [
      soloVencidos ? `LISTADO DE SALDOS VENCIDOS (>30 DÍAS) · ${new Date().toLocaleDateString("es-AR")}` : `LISTADO DE SALDOS ADEUDADOS · ${new Date().toLocaleDateString("es-AR")}`,
      "CLIENTE;DOCUMENTO;SALDO TOTAL;VENCIDO (>30 DÍAS);A VENCER",
      ...filas.map(({ c: cli, s }) => `${c(cli.razonSocial)};${c(cli.cuit || cli.dni || "")};${Number(s.saldo).toFixed(2)};${Number(s.vencido).toFixed(2)};${Number(s.aVencer).toFixed(2)}`),
      `TOTALES;;${filas.reduce((n, x) => n + Number(x.s.saldo), 0).toFixed(2)};${filas.reduce((n, x) => n + Number(x.s.vencido), 0).toFixed(2)};${filas.reduce((n, x) => n + Number(x.s.aVencer), 0).toFixed(2)}`,
    ];
    const csv = "\uFEFF" + lineas.join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = (soloVencidos ? "saldos-vencidos-" : "saldos-adeudados-") + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  }

  async function collect() {
    if (!selected || !totalPayment) return;
    if (checksMismatch) { setError('La suma de los cheques debe coincidir con el importe informado en CHEQUE.'); return; }
    try {
      const detalles = Object.entries(payments)
        .filter(([medio, v]) => medio !== 'cheque' && Number(v) > 0)
        .map(([medioPago, importe]) => ({ medioPago: medioPago.toUpperCase(), importe: Number(importe) }));
      for (const c of receivedChecks) {
        if (Number(c.importe) > 0) {
          detalles.push({
            medioPago: 'CHEQUE',
            importe: Number(c.importe),
            chequeNumero: c.numero,
            chequeBanco: c.banco,
            chequeFechaEmision: c.fechaEmision,
            chequeFechaCobro: c.vencimiento,
          } as any);
        }
      }
      const r = await api.collectClientAccount({ clienteId: selected.id, clienteDoc: selected.cuit || selected.dni, clienteNombre: selected.razonSocial, importe: totalPayment, detalles });
      setError("");
      setLastReceipt(r.recibo || null);
      await consult(selected);
    } catch (e: any) { setError(e.message); }
  }

  return <div className="accounts-page">
    {error && <div className="error-box">{error}</div>}
    {lastReceipt && <div className="success-box recepit-banner">Recibo {String(lastReceipt.punto_venta || 1).padStart(4, '0')}-{String(lastReceipt.numero || 0).padStart(8, '0')} generado. Cobro registrado.
      <button className="primary-action" onClick={() => api.downloadReceiptPdf(lastReceipt.id, `recibo-${lastReceipt.punto_venta}-${lastReceipt.numero}.pdf`)}><Printer size={16} /> Ver PDF del recibo</button>
      <button onClick={() => setLastReceipt(null)}>Cerrar</button>
    </div>}
    {!selected ? <div className="account-list-panel">
      <div className="account-title"><BadgeDollarSign /><h3>Cuentas Corrientes</h3></div>
      <div className="account-tools"><button className="primary-action" onClick={() => exportarSaldos(false)} title="Descargar Excel de todos los clientes con deuda"><Printer size={16} /> Exportar adeudados</button><button className="primary-action" onClick={() => exportarSaldos(true)} title="Descargar Excel de clientes con saldo vencido mayor a 30 días"><Printer size={16} /> Exportar vencidos</button></div>
      <div className="account-search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar deudor por nombre o documento..." /></div>
      <div className="debtor-grid">{filtered.filter(c => c.cuit || c.dni).map(c => { const s = summaries[String(c.id)] || { saldo: 0, vencido: 0, aVencer: 0 }; return <button key={c.id} onClick={() => consult(c)}>
        <div><strong>{c.razonSocial}</strong><span>Doc: {c.cuit || c.dni}</span></div>
        <div className="debtor-balance"><small>{Number(s.saldo) > 0 ? 'SALDO ADEUDADO' : 'AL DÍA'}</small><b className={Number(s.saldo) > 0 ? 'debt' : 'ok'}>$ {Number(s.saldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b>
          {Number(s.vencido) > 0 && <em className="saldo-vencido">Vencidos: $ {Number(s.vencido).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</em>}
          {Number(s.aVencer) > 0 && <em className="saldo-a-vencer">A vencer: $ {Number(s.aVencer).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</em>}
        <ChevronRight /></div>
      </button>})}</div>
    </div> : <div className="account-detail">
      <div className="account-detail-head">
        <button onClick={() => { setSelected(null); setData(null); }}>← VOLVER AL LISTADO</button>
        <div><span>SALDO ACTUAL</span><strong>$ {Number(data?.saldo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>
          {(() => { const v = calcularVencidos(data?.movimientos || []); return <div className="saldo-desglose">
            <em className={v.vencido > 0 ? 'saldo-vencido' : ''}>Saldos vencidos (&gt;30 días): $ {Number(v.vencido).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</em>
            <em className={v.aVencer > 0 ? 'saldo-a-vencer' : ''}>Saldo a vencer: $ {Number(v.aVencer).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</em>
          </div>; })()}
        </div>
      </div>
      <div className="account-columns">
        <section>
          <h4><History size={16} /> HISTORIAL DE COMPROBANTES Y COBROS</h4>
          <div className="account-movements">{(data?.movimientos || []).map((m: any) => <article key={m.id} className={Number(m.haber || 0) > 0 ? 'credit' : 'debit'}>
            <div><span>{new Date(m.created_at || m.fecha).toLocaleString('es-AR')}</span><strong>{m.concepto || m.tipo}</strong><small>{m.factura_id ? `Factura asociada #${m.factura_id}` : m.tipo === 'RECIBO' ? `Recibo #${m.documento_id}` : m.documento_id ? `Documento #${m.documento_id}` : ""}</small></div>
            <b>{Number(m.haber || 0) > 0 ? 'Cobro' : 'Comprobante'}: $ {Number(m.haber || m.debe || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b>
            <em>{m.observaciones || ""}</em>
            {Number(m.haber || 0) > 0 && m.tipo === 'RECIBO' && m.documento_id && <button className="mini-pdf" onClick={() => api.downloadReceiptPdf(m.documento_id, `recibo-${m.documento_id}.pdf`)}><Printer size={14} /> Ver recibo</button>}
          </article>)}</div>
        </section>
        <aside className="payment-card">
          <h3><CircleDollarSign /> Ingresar cobro</h3>
          {Object.keys(payments).map(k => <label key={k}>
            <span>{k.toUpperCase()}</span>
            <MoneyInput value={payments[k]} onChange={v => setPayments({ ...payments, [k]: v })} onCompleteMissing={() => {
              const current = Number(payments[k] || 0);
              const missing = Math.max(0, Number(data?.saldo || 0) - (totalPayment - current));
              setPayments({ ...payments, [k]: Number(missing.toFixed(2)) });
            }} />
          </label>)}
          {Number(payments.cheque) > 0 && <div className="check-capture">
            <div className="check-capture-head">
              <strong>Cheques recibidos</strong>
              <button type="button" onClick={() => setReceivedChecks([...receivedChecks, { id: Date.now(), numero: "", banco: "", librador: "", importe: 0, fechaEmision: new Date().toISOString().slice(0, 10), vencimiento: new Date().toISOString().slice(0, 10) }])}><Plus size={15} /> Agregar cheque</button>
            </div>
            {receivedChecks.map((c: any, index: number) => <div className="check-row" key={c.id}>
              <input placeholder="Número" value={c.numero} onChange={e => setReceivedChecks(receivedChecks.map((x: any, i: number) => i === index ? { ...x, numero: e.target.value } : x))} />
              <input placeholder="Banco" value={c.banco} onChange={e => setReceivedChecks(receivedChecks.map((x: any, i: number) => i === index ? { ...x, banco: e.target.value } : x))} />
              <MoneyInput value={c.importe} onChange={v => setReceivedChecks(receivedChecks.map((x: any, i: number) => i === index ? { ...x, importe: v } : x))} />
              <input type="date" value={c.vencimiento} onChange={e => setReceivedChecks(receivedChecks.map((x: any, i: number) => i === index ? { ...x, vencimiento: e.target.value } : x))} />
              <button type="button" onClick={() => setReceivedChecks(receivedChecks.filter((_: any, i: number) => i !== index))}>Quitar</button>
            </div>)}
            <small className={checksMismatch ? 'check-mismatch' : ''}>La suma de cheques debe coincidir con el importe informado en CHEQUE. Cargado: $ {checksTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</small>
          </div>}
          <div className="payment-total"><span>TOTAL</span><strong>$ {totalPayment.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></div>
          <button onClick={collect} disabled={!totalPayment || checksMismatch}>REGISTRAR PAGO Y RECIBO</button>
        </aside>
      </div>
    </div>}
  </div>;
}
