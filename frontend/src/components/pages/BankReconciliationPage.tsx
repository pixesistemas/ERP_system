import { useState, useEffect, useCallback } from "react";
import { fmtFecha } from "../../utils/fecha";
import { Plus, X, RefreshCw } from "lucide-react";
import { erpApi } from "../../services/api";
import { useServerRows } from "../../hooks/useServerStorage";

export function BankReconciliationPage() {
  const [bancos, setBancos] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [bank, setBank] = useState<any>('');
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [movs, saveMovs] = useServerRows('afip_bank_moves_v32', []);
  const load = useCallback(async () => {
    try {
      const r = await erpApi.bankReconciliation();
      setBancos(r.bancos || []);
      setError("");
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const selected = bancos.find((b: any) => String(b.id) === String(bank));
  const pendientes = (bank ? bancos.filter((b: any) => String(b.id) === String(bank)) : bancos).flatMap((b: any) => (b.movimientos || []).filter((m: any) => m.origen_tipo === 'DEPOSITO_CHEQUES' && !m.conciliado).map((m: any) => ({ ...m, banco_id: b.id })));
  const movimientos = [...movs.filter((m: any) => !bank || String(m.bancoId) === String(bank)), ...pendientes]
    .sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)));
  function addMovimiento(e: any) {
    e.preventDefault();
    if (!bank) { setError('Seleccioná un banco para agregar el movimiento.'); return; }
    saveMovs([{ ...editing, id: Date.now(), bancoId: Number(bank), conciliado: false }, ...movs.filter((x: any) => !x.origen_tipo)]);
    setEditing(null);
  }
  function toggleConciliado(r: any) {
    saveMovs(movs.filter((x: any) => !x.origen_tipo).map((x: any) => String(x.id) === String(r.id) ? { ...x, conciliado: !x.conciliado } : x));
  }
  async function conciliarDeposito(id: number) {
    setBusy(true);
    try {
      await erpApi.reconcileDeposit(id);
      await load();
      setError("");
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="products-page"><div className="products-toolbar"><div><h3>Conciliación bancaria</h3><p>Movimientos reales (depósitos de cheques, ventas por transferencia) contra el saldo del banco.</p></div><div className="inline-actions"><button onClick={() => load()}><RefreshCw size={16} /> Refrescar</button><button className="primary-action" onClick={()=>{if(!bank)return setError('Seleccioná un banco para agregar un movimiento.');setEditing({ fecha: new Date().toISOString().slice(0, 10), concepto: '', importe: 0, tipo: 'CREDITO' })}}><Plus /> Movimiento</button></div></div>{error && <div className="error-box">{error}</div>}<div className="report-filters"><label>Banco<select value={bank} onChange={e => setBank(e.target.value)}><option value="">Todos los bancos</option>{bancos.map((b: any) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label></div><div className="bank-summary-grid">{(bank ? bancos.filter((b: any) => String(b.id) === String(bank)) : bancos).map((b: any) => <div className="bank-summary-card" key={b.id}><h4>{b.nombre}</h4><div className="bank-summary-row"><span>Saldo inicial</span><b>$ {Number(b.saldoInicial).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b></div><div className="bank-summary-row"><span>Créditos</span><b className="ok">+ $ {Number(b.creditos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b></div><div className="bank-summary-row"><span>Débitos</span><b className="debt">- $ {Number(b.debitos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b></div><div className="bank-summary-row"><span>Depósitos pendientes de conciliar</span><b>$ {Number(b.pendientesDepositos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b></div><div className="bank-summary-total"><span>Saldo según sistema</span><strong>$ {Number(b.saldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></div></div>)}</div><div className="products-card"><table><thead><tr><th>Fecha</th><th>Banco</th><th>Concepto</th><th>Tipo</th><th>Importe</th><th>Conciliado</th></tr></thead><tbody>{movimientos.map((r: any, i: number) => <tr key={`${r.origen_tipo || 'm'}-${r.id}-${i}`}><td>{fmtFecha(r.fecha)}</td><td>{bancos.find((b: any) => String(b.id) === String(r.bancoId ?? r.banco_id))?.nombre || '—'}</td><td>{r.concepto}</td><td>{r.tipo}</td><td className="price">$ {Number(r.importe).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td><td>{r.origen_tipo === 'DEPOSITO_CHEQUES' && !r.conciliado ? <button className="primary-action" disabled={busy} onClick={() => conciliarDeposito(r.origen_id)}>Conciliar depósito</button> : r.origen_tipo ? <span className={r.conciliado ? 'badge success' : 'badge'}>{r.conciliado ? 'SÍ' : 'PENDIENTE'}</span> : <button className={r.conciliado ? 'badge success' : 'badge danger'} onClick={() => toggleConciliado(r)}>{r.conciliado ? 'SÍ' : 'PENDIENTE'}</button>}</td></tr>)}</tbody></table>{!movimientos.length && <div className="empty-table">No hay movimientos bancarios. Los depósitos de cheques y las ventas pagadas por transferencia aparecerán aquí.</div>}</div>{editing && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={addMovimiento}><div className="modal-head"><h3>Movimiento bancario manual</h3><button type="button" onClick={() => setEditing(null)}><X /></button></div><div className="form-grid"><label className="full">Concepto<input required value={editing.concepto} onChange={e => setEditing({ ...editing, concepto: e.target.value })} /></label><label>Fecha<input type="date" value={editing.fecha} onChange={e => setEditing({ ...editing, fecha: e.target.value })} /></label><label>Tipo<select value={editing.tipo} onChange={e => setEditing({ ...editing, tipo: e.target.value })}><option value="CREDITO">CRÉDITO</option><option value="DEBITO">DÉBITO</option></select></label><label>Importe<input type="number" step="any" value={editing.importe} onChange={e => setEditing({ ...editing, importe: Number(e.target.value) })} /></label></div><div className="modal-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-action" type="submit">Guardar</button></div></form></div>}</div>;
}