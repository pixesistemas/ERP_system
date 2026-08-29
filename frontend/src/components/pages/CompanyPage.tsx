import { useState, useEffect } from "react";
import { Save, ShieldCheck, KeyRound, FileKey2, Lock } from "lucide-react";
import { useServerRows, useServerValue } from "../../hooks/useServerStorage";
import { erpApi } from "../../services/api";

export function CompanyPage() {
  const [branches] = useServerRows('afip_branches_v32', [{ id: 1, codigo: '001', nombre: 'Principal', activo: true }]);
  const [points] = useServerRows('afip_point_sales_v35', [{ id: 1, numero: '0001', nombre: 'Casa central', sucursalId: 1, arcaHabilitado: true, activo: true }]);
  const [data, setData, saveCompany] = useServerValue<any>('afip_company_v31', { razonSocial: 'empresa1', cuit: '', domicilio: '', telefono: '', email: '', inicioActividades: '', logoUrl: '', usaSucursalAlIniciar: true, sucursalPredeterminadaId: 1, arcaAmbiente: 'HOMOLOGACION' });
  const [ok, setOk] = useState('');
  const [fiscalFiles, setFiscalFiles] = useState<any[]>([]);
  const [conectado, setConectado] = useState<{ certificado: boolean; llave: boolean }>({ certificado: false, llave: false });
  const [fiscalError, setFiscalError] = useState('');

  async function loadFiscalFiles() {
    try {
      const r = await erpApi.listFiscalFiles();
      setFiscalFiles(r.files || []);
      setConectado(r.conectado || { certificado: false, llave: false });
    } catch (e: any) {
      setFiscalError(e.message);
    }
  }
  useEffect(() => { loadFiscalFiles(); }, []);

  function fileFor(tipo: string) {
    return fiscalFiles.find((f: any) => f.tipo === tipo);
  }

  function save() {
    saveCompany(data).then(() => { setOk('Preferencias de operación guardadas.'); setTimeout(() => setOk(''), 2000); }).catch((e: any) => alert(e.message));
  }

  const valor = (v: any) => (v === undefined || v === null || v === '' ? '—' : v);

  return <div className="settings-page">
    <div className="settings-card">
      <h3>Datos fiscales y ARCA</h3>
      <div className="security-note full">
        <Lock />
        <div><strong>Administrado por PixeSistemas</strong><span>Los datos fiscales, el ambiente ARCA y los certificados se gestionan desde el panel del superadministrador. No se pueden modificar desde acá.</span></div>
      </div>
      <div className="form-grid">
        <label className="full">Razón social<b className="readonly-field">{valor(data.razonSocial)}</b></label>
        <label>CUIT<b className="readonly-field">{valor(data.cuit)}</b></label>
        <label>Inicio de actividades<b className="readonly-field">{valor(data.inicioActividades)}</b></label>
        <label className="full">Domicilio<b className="readonly-field">{valor(data.domicilio)}</b></label>
        <label>Teléfono<b className="readonly-field">{valor(data.telefono)}</b></label>
        <label>Email<b className="readonly-field">{valor(data.email)}</b></label>
        <label className="full">Logo de la empresa<b className="readonly-field">{valor(data.logoUrl)}</b></label>
        <label>Condición IVA empresa<b className="readonly-field">{valor(data.condicionIVA || 'RESPONSABLE INSCRIPTO')}</b></label>
        <label>Ambiente ARCA<b className="readonly-field">{data.arcaAmbiente === 'PRODUCCION' ? 'Producción' : 'Homologación'}</b></label>
        <label>Punto de venta predeterminado<select value={data.puntoVentaPredeterminadoId || ''} onChange={e => setData({ ...data, puntoVentaPredeterminadoId: e.target.value })}><option value="">Seleccionar...</option>{points.map((x: any) => <option key={x.id} value={x.id}>{x.numero} · {x.nombre}</option>)}</select></label>

        <label className="full upload-field">
          <span className="label-icon"><FileKey2 size={16} /> Certificado ARCA (.crt)</span>
          <small>{fileFor('CERTIFICADO') ? `Cargado: ${fileFor('CERTIFICADO').nombre_original}` : 'No cargado'} — {conectado.certificado ? <span style={{ color: 'var(--text-success, #2F9E67)' }}>conectado con la facturación</span> : <span style={{ color: 'var(--text-danger, #C2536B)' }}>todavía no conectado</span>}</small>
        </label>
        <label className="full upload-field">
          <span className="label-icon"><KeyRound size={16} /> Llave privada ARCA (.key)</span>
          <small>{fileFor('LLAVE_PRIVADA') ? `Cargada: ${fileFor('LLAVE_PRIVADA').nombre_original}` : 'No cargada'} — {conectado.llave ? <span style={{ color: 'var(--text-success, #2F9E67)' }}>conectada con la facturación</span> : <span style={{ color: 'var(--text-danger, #C2536B)' }}>todavía no conectada</span>}</small>
        </label>
        {fiscalError && <div className="error-box full">{fiscalError}</div>}

        <div className="security-note full">
          <ShieldCheck />
          <div><strong>Las credenciales no deben subirse a GitHub</strong><span>El certificado y la llave se guardan en el servidor, en una carpeta protegida — no en el navegador.</span></div>
        </div>

        <label>Sucursal predeterminada<select value={data.sucursalPredeterminadaId || ''} onChange={e => setData({ ...data, sucursalPredeterminadaId: Number(e.target.value) })}><option value="">Seleccionar...</option>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        <label className="toggle-row"><div><strong>Solicitar sucursal al iniciar</strong><span>Determina stock y caja.</span></div><input type="checkbox" checked={Boolean(data.usaSucursalAlIniciar)} onChange={e => setData({ ...data, usaSucursalAlIniciar: e.target.checked })} /></label>
      </div>
      {data.logoUrl && <img className="company-logo-preview" src={data.logoUrl} />}
      {ok && <div className="success-box">{ok}</div>}
      <button className="primary-action" onClick={save}><Save /> Guardar preferencias</button>
    </div>
  </div>;
}