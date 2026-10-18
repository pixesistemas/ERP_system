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
  const [agenteEstado, setAgenteEstado] = useState('');
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

  /* Ticket de prueba: con agente local sale en ESC/POS; si no, por el navegador. */
  async function pruebaImpresion(pv: any) {
    setError('');
    setOk('');
    try {
      if (String(pv.impresion_modo || 'NAVEGADOR').toUpperCase() === 'AGENTE') {
        if (String(pv.agente_conexion || 'LOCAL').toUpperCase() === 'SERVIDOR') {
          await erpApi.imprimirTicketPruebaAgente(Number(pv.id));
          setOk(`Ticket de prueba encolado al agente (PV ${String(pv.numero).padStart(4, '0')}). En unos segundos sale por la impresora.`);
          return;
        }
        const t = await erpApi.getTicketPruebaEscpos(Number(pv.id));
        await erpApi.imprimirEnAgente(pv, { datos_base64: t.base64, descripcion: 'Ticket de prueba (agente)' });
        setOk(`Ticket de prueba enviado al agente local (PV ${String(pv.numero).padStart(4, '0')}). Revisá la impresora.`);
        return;
      }
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

  /*
   * Consulta el agente configurado en el formulario:
   * - SERVIDOR: pregunta al ERP por el último latido del token.
   * - LOCAL: consulta el agente en 127.0.0.1 y lista las impresoras.
   */
  async function consultarAgente() {
    setAgenteEstado('Consultando el agente…');
    if (String(editing?.agente_conexion || 'LOCAL').toUpperCase() === 'SERVIDOR') {
      const token = String(editing?.agente_token || '').trim();
      if (!token) {
        setAgenteEstado('Pegá primero el token del agente.');
        return;
      }
      try {
        const e = await erpApi.estadoAgente(token);
        if (e.conectado) {
          setAgenteEstado(`Agente conectado al servidor (v${e.version || '?'} · ${e.plataforma || '?'}). Impresión lista.`);
        } else {
          setAgenteEstado('El agente no está conectado al servidor. Verificá que esté abierto en la PC del local y que en la bandeja esté configurada la URL del ERP.');
        }
      } catch (err: any) {
        setAgenteEstado(err.message);
      }
      return;
    }
    const base = String(editing?.agente_url || 'http://127.0.0.1:17777').replace(/\/+$/, '');
    try {
      const salud = await fetch(`${base}/salud`).then((r) => r.json());
      let impresoras: string[] = [];
      try {
        const listaRes = await fetch(`${base}/impresoras`).then((r) => r.json());
        impresoras = listaRes.impresoras || [];
      } catch (e) {
        /* la lista es informativa */
      }
      setAgenteEstado(`Agente v${salud.version || '?'} (${salud.plataforma || ''}) respondiendo en ${base}. Impresoras del sistema: ${impresoras.length ? impresoras.join(' | ') : 'ninguna detectada'}.`);
    } catch (e) {
      setAgenteEstado(`No se pudo contactar al agente en ${base}. Verificá que esté corriendo en esta PC (iniciar-oculto.vbs o iniciar-windows.bat).`);
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
        impresion_modo: String(editing.impresion_modo || 'NAVEGADOR').toUpperCase() === 'AGENTE' ? 'AGENTE' : 'NAVEGADOR',
        impresora_tipo: String(editing.impresora_tipo || 'RED').toUpperCase() === 'SISTEMA' ? 'SISTEMA' : 'RED',
        impresora_host: editing.impresora_host || '',
        impresora_puerto: Number(editing.impresora_puerto) || 9100,
        impresora_nombre: editing.impresora_nombre || '',
        agente_url: editing.agente_url || 'http://127.0.0.1:17777',
        agente_token: editing.agente_token || '',
        agente_conexion: String(editing.agente_conexion || 'LOCAL').toUpperCase() === 'SERVIDOR' ? 'SERVIDOR' : 'LOCAL',
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
      <button className="primary-action" onClick={() => setEditing({ numero: '', nombre: '', nombre_fantasia: '', direccion: '', telefono: '', whatsapp: '', email: '', sucursal_id: '', fiscal: true, activo: true, formato_impresion: 'A4', impresion_directa: false, impresion_modo: 'NAVEGADOR', impresora_tipo: 'RED', impresora_host: '', impresora_puerto: 9100, impresora_nombre: '', agente_url: 'http://127.0.0.1:17777', agente_token: '', agente_conexion: 'LOCAL' })}><Plus /> Nuevo punto</button>
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
          <td>{r.formato_impresion === '80MM' ? 'Ticket 80 mm' : 'Hoja A4'}{String(r.impresion_modo || 'NAVEGADOR').toUpperCase() === 'AGENTE' ? ` · Agente ${String(r.agente_conexion || 'LOCAL').toUpperCase() === 'SERVIDOR' ? 'servidor' : (String(r.impresora_tipo || 'RED').toUpperCase() === 'SISTEMA' ? (r.impresora_nombre || 'sistema') : `${r.impresora_host || '?'}:${r.impresora_puerto || 9100}`)}` : r.impresion_directa ? ' · Directa' : ''}</td>
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
        <label>Modo de impresión<select value={editing.impresion_modo || 'NAVEGADOR'} onChange={e => setEditing({ ...editing, impresion_modo: e.target.value })}><option value="NAVEGADOR">Navegador (ventana / Chrome kiosco)</option><option value="AGENTE">Agente local (ESC/POS, sin navegador)</option></select></label>
        {String(editing.impresion_modo || 'NAVEGADOR').toUpperCase() === 'AGENTE' && <>
          <label>Conexión del agente<select value={editing.agente_conexion || 'LOCAL'} onChange={e => setEditing({ ...editing, agente_conexion: e.target.value })}><option value="LOCAL">Directa (esta PC, 127.0.0.1)</option><option value="SERVIDOR">A través del servidor (recomendado)</option></select></label>
          <label>Tipo de impresora<select value={editing.impresora_tipo || 'RED'} onChange={e => setEditing({ ...editing, impresora_tipo: e.target.value })}><option value="RED">De red (IP y puerto)</option><option value="SISTEMA">Instalada en Windows/Linux (USB)</option></select></label>
          {String(editing.impresora_tipo || 'RED').toUpperCase() === 'SISTEMA'
            ? <label>Nombre de la impresora instalada<input value={editing.impresora_nombre || ''} placeholder="Ej.: POS-80" onChange={e => setEditing({ ...editing, impresora_nombre: e.target.value })} /></label>
            : <><label>IP de la impresora<input value={editing.impresora_host || ''} placeholder="Ej.: 192.168.0.50" onChange={e => setEditing({ ...editing, impresora_host: e.target.value })} /></label><label>Puerto<input type="number" value={editing.impresora_puerto || 9100} onChange={e => setEditing({ ...editing, impresora_puerto: Number(e.target.value) || 9100 })} /></label></>}
          {String(editing.agente_conexion || 'LOCAL').toUpperCase() === 'SERVIDOR'
            ? <div className="full agent-status">El agente se conecta solo al ERP: abrí el icono de la bandeja en la PC del local y cargá la URL del ERP (ej. https://erp.pixesistemas.com.ar). No hace falta URL local ni permisos del navegador.</div>
            : <label>URL del agente<input value={editing.agente_url || 'http://127.0.0.1:17777'} onChange={e => setEditing({ ...editing, agente_url: e.target.value })} /></label>}
          <label>Token del agente<input value={editing.agente_token || ''} placeholder="Lo muestra el agente al iniciar" onChange={e => setEditing({ ...editing, agente_token: e.target.value })} /></label>
          <div className="full">
            <button type="button" className="link-button" onClick={() => consultarAgente()}>Consultar agente</button>
            {agenteEstado && <div className="agent-status">{agenteEstado}</div>}
          </div>
        </>}
        <label className="toggle-row"><span>Habilitado para ARCA</span><input type="checkbox" checked={Boolean(editing.fiscal)} onChange={e => setEditing({ ...editing, fiscal: e.target.checked })} /></label>
      </div>
      <div className="modal-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="save">Guardar</button></div>
    </form></div>}
  </div>;
}
