import { useState, useEffect } from "react";
import { Printer, Save } from "lucide-react";
import { erpApi } from "../../services/api";

export function PointPrintSettings() {
  const [error, setError] = useState('');
  const [maxItems, setMaxItems] = useState(0);
  const [saving, setSaving] = useState(false);

  async function loadPrintConfig() {
    try {
      const r: any = await erpApi.getState('pos_impresion');
      const value = r.value;
      setMaxItems(Number(value?.maxItemsPorHoja || 0));
    } catch {
      setMaxItems(0);
    }
  }

  useEffect(() => { loadPrintConfig(); }, []);

  async function saveMaxItems() {
    setSaving(true);
    setError('');
    try {
      await erpApi.saveState('pos_impresion', { maxItemsPorHoja: Number(maxItems) || 0 });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="point-print-settings">
    <div><Printer size={20} /><span><strong>Impresión POS</strong><small>El formato de cada comprobante (A4 o ticket 80 mm) se elige en Configuración → Comprobantes.</small></span></div>
    {error && <div className="error-box">{error}</div>}

    <div className="print-pages-config">
      <span><strong>Ítems por hoja A4</strong><small>Si una factura supera esta cantidad de renglones, se genera otra hoja y cada una indica ORIGINAL 1/N, 2/N. 0 = sin límite (una sola hoja).</small></span>
      <div className="print-pages-row">
        <input type="number" min={0} value={maxItems} onChange={e => setMaxItems(Number(e.target.value))} />
        <button className="primary-action" onClick={saveMaxItems} disabled={saving}><Save size={16} /> Guardar</button>
      </div>
    </div>
  </div>;
}