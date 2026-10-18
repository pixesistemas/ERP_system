import { useState, useEffect, useRef } from "react";
import { Plus, Pencil, X, ImageUp, Printer } from "lucide-react";
import { erpApi } from "../../services/api";

export function PointOfSalesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const logoRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    try {
      const [points, catalogs] = await Promise.all([
        erpApi.listPointsOfSale(),
        erpApi.listPosCatalogs(),
      ]);
      setRows(points.pointsOfSale || []);
      setBranches(catalogs.branches || []);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  /* Ticket de prueba: sale por la misma vía directa que usa el POS (iframe oculto). */
  async function pruebaImpresion(pv: any) {
    setError('');
    setOk('');
    try {
      const res = await erpApi.printTestTicket(Number(pv.id), true);
      if (res === false) {
        setError('El ticket se generó, pero Chrome no confirmó la impresión. Revisá: 1) que esta ventana sea la de Chrome abierta con --kiosk-printing; 2) que la impresora del puerto 9100 sea la predeterminada en Windows; 3) la "página de prueba" de esa impresora desde Windows.');
      } else {
        setOk(`Orden de impresión enviada (PV ${String(pv.numero).padStart(4, '0')}). Si no aparece en el emulador, el problema está en Windows: probá la página de prueba de esa impresora y revisá la cola de impresión.`);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function uploadLogo(pv: any, file: File) {
    setError('');
    if (!/^image\//.test(file.type)) return setError('El logo debe ser una imagen (PNG, JPG, WEBP).');
    if (file.size > 1024 * 1024) return setError('El logo supera 1 MB.');
    setLogoBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.readAsDataURL(file);
      });
      await erpApi.uploadPointOfSaleLogo(pv.id, dataUrl);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo(pv: any) {
    if (!confirm(`¿Quitar el logo propio del punto de venta ${pv.numero}? Los comprobantes volverán a usar el logo de la empresa.`)) return;
    setLogoBusy(true);
    try {
      await erpApi.uploadPointOfSaleLogo(pv.id, '');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLogoBusy(false);
    }
  }

  async function submit(e: any) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        numero: editing.numero,
        nombre: editing.nombre,
        nombre_fantasia: editing.nombre_fantasia || '',
        direccion: editing.direccion || '',
        telefono: editing.telefono || '',
        whatsapp: editing.whatsapp || '',
        email: editing.email || '',
        sucursal_id: editing.sucursal_id || null,
        fiscal: editing.fiscal,
        activo: editing.activo,
        formato_impresion: editing.formato_impresion || 'A4',
        impresion_directa: Boolean(editing.impresion_directa),
      };
      if (editing.id) await erpApi.updatePointOfSale(editing.id, payload);
      else await erpApi.createPointOfSale(payload);
      setEditing(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Puntos de venta</h3><p>Una empresa puede tener varios puntos de venta y numeraciones independientes.</p></div>
      <button className="primary-action" onClick={() => setEditing({ numero: '', nombre: '', nombre_fantasia: '', direccion: '', telefono: '', whatsapp: '', email: '', sucursal_id: '', fiscal: true, activo: true, formato_impresion: 'A4', impresion_directa: false })}><Plus /> Nuevo punto</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    {ok && <div className="success-box">{ok}</div>}
    <div className="products-card">
      <table>
        <thead><tr><th>Número</th><th>Nombre</th><th>Nombre fantasía</th><th>Dirección</th><th>Contacto</th><th>Sucursal</th><th>Formato</th><th>Logo propio</th><th>ARCA</th><th>Estado</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => <tr key={r.id}>
          <td><strong>{String(r.numero).padStart(4, '0')}</strong></td>
          <td>{r.nombre}</td>
          <td>{r.nombre_fantasia || <span className="muted">—</span>}</td>
          <td>{r.direccion || <span className="muted">—</span>}</td>
          <td>{[r.telefono && `Tel: ${r.telefono}`, r.whatsapp && `WhatsApp: ${r.whatsapp}`, r.email && r.email].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
          <td>{branches.find((b: any) => String(b.id) === String(r.sucursal_id))?.nombre || '-'}</td>
          <td>{r.formato_impresion === '80MM' ? 'Ticket 80 mm' : 'Hoja A4'}{r.impresion_directa ? ' · Directa' : ''}</td>
          <td>{r.logo ? <span className="pv-logo-cell">{r.logo.startsWith('data:image/') && <img src={r.logo} alt="logo" />}<button type="button" className="link-button" disabled={logoBusy} onClick={() => removeLogo(r)}>Quitar</button></span> : <button type="button" className="link-button" disabled={logoBusy} onClick={() => logoRefs.current[r.id]?.click()}><ImageUp size={14} /> Subir logo</button>}<input ref={el => { logoRefs.current[r.id] = el; }} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadLogo(r, f); }} /></td>
          <td>{r.fiscal ? 'HABILITADO' : 'INTERNO'}</td>
          <td>{r.activo ? 'ACTIVO' : 'INACTIVO'}</td>
          <td className="inline-actions"><button type="button" title="Imprimir ticket de prueba (usa la impresión directa de este punto)" onClick={() => pruebaImpresion(r)}><Printer size={16} /></button><button onClick={() => setEditing({ ...r })}><Pencil size={16} /></button></td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <div className="empty-table">No hay puntos de venta cargados.</div>}
    </div>
    {editing && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={submit}>
      <div className="modal-head"><h3>Punto de venta</h3><button type="button" onClick={() => setEditing(null)}><X /></button></div>
      <div className="form-grid">
        <label>Número<input required maxLength={4} placeholder="0001" value={editing.numero} onChange={e => setEditing({ ...editing, numero: e.target.value.replace(/\D/g, '').slice(-5) })} /></label>
        <label>Nombre<input required value={editing.nombre} onChange={e => setEditing({ ...editing, nombre: e.target.value })} /></label>
        <label>Nombre de fantasía (impresión)<input value={editing.nombre_fantasia || ''} placeholder="Opcional: se imprime en los comprobantes de este punto de venta" onChange={e => setEditing({ ...editing, nombre_fantasia: e.target.value })} /></label>
        <label>Dirección<input value={editing.direccion || ''} placeholder="Opcional: se muestra en encabezados y comprobantes" onChange={e => setEditing({ ...editing, direccion: e.target.value })} /></label>
        <label>Teléfono<input value={editing.telefono || ''} placeholder="Ej.: 0345-4000000" onChange={e => setEditing({ ...editing, telefono: e.target.value })} /></label>
        <label>WhatsApp<input value={editing.whatsapp || ''} placeholder="Ej.: 3454-000000" onChange={e => setEditing({ ...editing, whatsapp: e.target.value })} /></label>
        <label>Email<input type="email" value={editing.email || ''} placeholder="Ej.: sucursal@empresa.com" onChange={e => setEditing({ ...editing, email: e.target.value })} /></label>
        <label>Sucursal<select value={editing.sucursal_id || ''} onChange={e => setEditing({ ...editing, sucursal_id: e.target.value })}><option value="">Seleccionar...</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        <label>Formato de impresión<select value={editing.formato_impresion || 'A4'} onChange={e => setEditing({ ...editing, formato_impresion: e.target.value })}><option value="A4">Hoja A4</option><option value="80MM">Ticket 80 mm</option></select></label>
        <label className="toggle-row" title="Con Chrome en modo kiosco (--kiosk-printing) el comprobante sale directo a la impresora, sin abrir la vista previa. El ticket de 80 mm imprime directo siempre, tenga o no esta opción."><span>Impresión directa (sin vista previa)</span><input type="checkbox" checked={Boolean(editing.impresion_directa)} onChange={e => setEditing({ ...editing, impresion_directa: e.target.checked })} /></label>
        <label className="toggle-row"><span>Habilitado para ARCA</span><input type="checkbox" checked={Boolean(editing.fiscal)} onChange={e => setEditing({ ...editing, fiscal: e.target.checked })} /></label>
      </div>
      <div className="modal-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="save">Guardar</button></div>
    </form></div>}
  </div>;
}
