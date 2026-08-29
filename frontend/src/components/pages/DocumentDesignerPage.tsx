import { useState } from "react";
import { Save } from "lucide-react";
import { useServerValue } from "../../hooks/useServerStorage";

const FUENTES = ["Arial", "Helvetica", "Verdana", "Tahoma", "Times New Roman", "Courier New", "Georgia", "Consolas"];

export function DocumentDesignerPage() {
  const [previewType, setPreviewType] = useState('FACTURA');
  const [cfg, setCfg, saveDesigner] = useServerValue<any>('afip_designer_v40', {
    pie: 'Gracias por su compra',
    fontSize: 11,
    fontFamily: 'Arial',
    maxItemsPorHoja: 0,
    footerPegado: true,
  });
  const [status, setStatus] = useState('');

  function save() {
    saveDesigner({ pie: cfg.pie, fontSize: cfg.fontSize, fontFamily: cfg.fontFamily || 'Arial', maxItemsPorHoja: Number(cfg.maxItemsPorHoja || 0), footerPegado: cfg.footerPegado !== false })
      .then(() => { setStatus('Guardado. Ya se aplica a facturas, presupuestos, remitos y tickets del punto de venta.'); setTimeout(() => setStatus(''), 3000); })
      .catch((e: any) => setStatus(e.message));
  }

  const isRemito = previewType === 'REMITO';
  const isPres = previewType === 'PRESUPUESTO';
  const footerPegado = cfg.footerPegado !== false;

  return <div className="products-page">
    <div className="products-toolbar">
      <div>
        <h3>Diseñador de comprobantes</h3>
        <p>
          Tipografía y tamaño de letra para todos los comprobantes (facturas, presupuestos,
          remitos, notas de pedido y tickets del punto de venta). El pie de página pegado al
          final de las líneas y el formato de hoja (A4 o 80 mm) se configuran por comprobante
          en Configuración de comprobantes. La razón social, CUIT, domicilio y logo de la
          empresa se configuran en Configuración de empresa — no se repiten acá.
        </p>
      </div>
      <button className="primary-action" onClick={save}><Save /> Guardar</button>
    </div>
    {status && <div className="success-box">{status}</div>}
    <div className="designer-layout">
      <section className="settings-card">
        <label>Tipo de letra<select value={cfg.fontFamily || 'Arial'} onChange={e => setCfg({ ...cfg, fontFamily: e.target.value })}>
          {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
        </select></label>
        <label>Tamaño de letra (px)<input type="number" min="8" max="16" value={cfg.fontSize} onChange={e => setCfg({ ...cfg, fontSize: Number(e.target.value) })} /></label>
        <label>Renglones por hoja (0 = sin límite)<input type="number" min="0" max="200" value={cfg.maxItemsPorHoja || 0} onChange={e => setCfg({ ...cfg, maxItemsPorHoja: Number(e.target.value) })} /></label>
        <label>Texto de pie de página<textarea value={cfg.pie} onChange={e => setCfg({ ...cfg, pie: e.target.value })} /></label>
        <label>Vista previa de<select value={previewType} onChange={e => setPreviewType(e.target.value)}>
          <option value="FACTURA">Factura A/B/C</option>
          <option value="PRESUPUESTO">Presupuesto</option>
          <option value="REMITO">Remito</option>
        </select></label>
        <p><small>El selector de arriba solo cambia lo que ves en la vista previa — las opciones son las mismas para todos los tipos de comprobante.</small></p>
      </section>
      <section className="designer-preview-card">
        <div className={`doc-preview-editable${footerPegado ? ' footer-pegado' : ''}`} style={{ fontSize: cfg.fontSize, fontFamily: cfg.fontFamily || 'Arial' }}>
          <header>
            <div><h2>(Razón social configurada en la empresa)</h2></div>
            <div><h1>{previewType}</h1><strong>N° 00001-00000001</strong></div>
          </header>
          <section className="doc-client"><b>Cliente:</b> CLIENTE DEMO</section>
          <table>
            <thead><tr><th>Cantidad</th><th>Descripción</th>{!isRemito && <><th>P. Unitario</th><th>Total</th></>}</tr></thead>
            <tbody><tr><td>2,000</td><td>PRODUCTO DE DEMOSTRACIÓN</td>{!isRemito && <><td>$ 1.000,00</td><td>$ 2.000,00</td></>}</tr></tbody>
          </table>
          <footer>
            <div><b>Pie de página:</b><br />{isPres ? 'Documento no válido como factura.' : cfg.pie}</div>
            {!isRemito && <div><b>Total</b><h2>$ 2.000,00</h2></div>}
          </footer>
        </div>
      </section>
    </div>
  </div>;
}