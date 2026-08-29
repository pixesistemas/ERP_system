import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { erpApi } from "../../services/api";
import { useServerRows } from "../../hooks/useServerStorage";

export function PriceUpdatePage() {
  const [mode, setMode] = useState('PORCENTAJE');
  const [direction, setDirection] = useState('AUMENTA');
  const [value, setValue] = useState(0);
  const [filter, setFilter] = useState('TODOS');
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogs] = useServerRows('afip_catalogs_v34', []);
  const [suppliers] = useServerRows('afip_suppliers_v30', []);

  const catalogsPorTipo = (tipo: string) => catalogs.filter((c: any) => String(c.tipo || '').toUpperCase() === tipo);
  const opciones = filter === 'PROVEEDOR'
    ? suppliers.map((s: any) => ({ id: String(s.id), nombre: s.razonSocial || s.nombre || '' }))
    : filter === 'RUBRO' ? catalogsPorTipo('RUBRO').map((c: any) => ({ id: String(c.id), nombre: c.nombre }))
    : filter === 'SUBRUBRO' ? catalogsPorTipo('SUBRUBRO').map((c: any) => ({ id: String(c.id), nombre: c.nombre }))
    : filter === 'MARCA' ? catalogsPorTipo('MARCA').map((c: any) => ({ id: String(c.id), nombre: c.nombre }))
    : filter === 'TIPO' ? ['RUBRO', 'SUBRUBRO', 'MARCA'].map((t) => ({ id: t, nombre: t }))
    : [];

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function process() {
    setError(''); setNotice('');
    if (!Number(value)) { setError('Ingresá un valor mayor a cero.'); return; }
    if (filter !== 'TODOS' && !selected.length) { setError('Seleccioná al menos una opción del filtro (o TODOS).'); return; }
    setBusy(true);
    try {
      const r = await erpApi.updatePrices({ filtro: filter, ids: selected, direccion: direction, modalidad: mode, valor: Number(value) });
      setNotice(r.mensaje || `Se actualizaron ${r.actualizados || 0} producto(s).`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function limpiar() { setSelected([]); setNotice(''); setError(''); }

  return <div className="products-page"><div className="products-toolbar"><div><h3>Actualización masiva de precios</h3><p>Filtrá por rubro, subrubro, marca o proveedor (uno o varios) y aplicá aumento o disminución.</p></div></div>
    <div className="settings-card price-update-card">
      <div className="form-grid">
        <label>Filtro<select value={filter} onChange={e => { setFilter(e.target.value); setSelected([]); setNotice(''); setError(''); }}>
          <option value="TODOS">Todos los productos</option>
          <option value="RUBRO">Rubro</option>
          <option value="SUBRUBRO">Subrubro</option>
          <option value="MARCA">Marca</option>
          <option value="PROVEEDOR">Proveedor</option>
          <option value="TIPO">Tipo de catálogo</option>
        </select></label>
        <label>Acción<select value={direction} onChange={e => setDirection(e.target.value)}>
          <option value="AUMENTA">Aumentar</option>
          <option value="DISMINUYE">Disminuir</option>
        </select></label>
        <label>Modalidad<select value={mode} onChange={e => setMode(e.target.value)}>
          <option value="PORCENTAJE">Por porcentaje</option>
          <option value="ABSOLUTO">Valor absoluto</option>
        </select></label>
        <label>Valor<input type="number" value={value} onFocus={e => e.currentTarget.select()} onChange={e => setValue(Number(e.target.value))} /></label>
      </div>
      {filter !== 'TODOS' && <>
        <div className="price-filter-head">
          <strong>Seleccioná {filter === 'TIPO' ? 'los tipos' : `los ${filter.toLowerCase()} a actualizar`} ({selected.length} seleccionados)</strong>
          <div className="inline-actions">
            <button type="button" onClick={() => setSelected(opciones.map((o: any) => o.id))}>Seleccionar todos</button>
            <button type="button" onClick={limpiar}>Limpiar</button>
          </div>
        </div>
        <div className="multi-check-selector price-multi">
          {opciones.map((o: any) => <label key={o.id}><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} /><span><b>{o.nombre}</b></span></label>)}
          {!opciones.length && <div className="empty-table">No hay opciones cargadas para este filtro.</div>}
        </div>
      </>}
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}
      <button className="primary-action" disabled={busy} onClick={process}>{busy ? <><RefreshCw size={16} /> Procesando…</> : <><Check /> Procesar actualización</>}</button>
    </div>
  </div>;
}