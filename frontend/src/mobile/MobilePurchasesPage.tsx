import { useRef, useState } from "react";
import { Camera, Check, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { erpApi } from "../services/api";

/*
 * App móvil de compras (PWA): sacás la foto de la factura del proveedor,
 * el OCR lee los datos, los revisás y se carga la compra al sistema.
 */
export function MobilePurchasesPage() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState<any>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  function elegir(file: File | null) {
    if (!file) return;
    setError("");
    setOk("");
    setArchivo(file);
    setPreview(URL.createObjectURL(file));
    setForm(null);
  }

  async function leer() {
    if (!archivo) return setError("Primero sacá la foto de la factura.");
    setLeyendo(true);
    setError("");
    try {
      const r = await erpApi.ocrPurchaseInvoice(archivo);
      const d = r.datos || {};
      const tipo = String(d.tipo_comprobante || "FACTURA").toUpperCase().replace("CREDITO", "CRÉDITO").replace("DEBITO", "DÉBITO");
      const detalles = (d.iva_detalles || []).length
        ? d.iva_detalles.map((x: any) => ({ alicuota: Number(x.alicuota || 21), total_con_iva: Math.round((Number(x.neto || 0) + Number(x.iva || 0)) * 100) / 100 }))
        : [{ alicuota: 21, total_con_iva: Number(d.total || 0) }];
      setForm({
        proveedor_nombre: d.proveedor_nombre || "",
        proveedor_documento: d.proveedor_documento || "",
        proveedor_condicion_iva: d.proveedor_condicion_iva || "RESPONSABLE INSCRIPTO",
        tipo_comprobante: tipo,
        letra: d.letra || "A",
        punto_venta: Number(d.punto_venta || 1) || 1,
        numero: d.numero || "",
        fecha: d.fecha || new Date().toISOString().slice(0, 10),
        fecha_vencimiento: d.fecha_vencimiento || d.fecha || new Date().toISOString().slice(0, 10),
        exento_no_gravado: Number(d.exento_no_gravado || 0),
        iva_detalles: detalles,
        confianza: d.confianza || "",
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLeyendo(false);
    }
  }

  function patch(campo: string, valor: any) {
    setForm((f: any) => ({ ...f, [campo]: valor }));
  }

  function patchIva(index: number, campo: string, valor: any) {
    setForm((f: any) => ({
      ...f,
      iva_detalles: f.iva_detalles.map((x: any, i: number) => (i === index ? { ...x, [campo]: valor } : x)),
    }));
  }

  function totales() {
    if (!form) return { neto: 0, iva: 0, total: 0 };
    let neto = 0, iva = 0, totalLineas = 0;
    for (const linea of form.iva_detalles) {
      const bruto = Number(linea.total_con_iva || 0);
      const rate = Number(linea.alicuota || 0);
      const n = rate ? bruto / (1 + rate / 100) : bruto;
      neto += n;
      iva += bruto - n;
      totalLineas += bruto;
    }
    const total = totalLineas + Number(form.exento_no_gravado || 0);
    return { neto, iva, total };
  }

  async function guardar() {
    if (!form) return;
    if (!form.proveedor_nombre.trim()) return setError("Falta el proveedor.");
    if (!form.numero.trim()) return setError("Falta el número del comprobante.");
    setLeyendo(true);
    setError("");
    try {
      const t = totales();
      const fecha = new Date(`${form.fecha}T12:00:00`);
      await erpApi.createPurchase({
        proveedor_nombre: form.proveedor_nombre.trim(),
        proveedor_documento: form.proveedor_documento,
        proveedor_domicilio: "",
        proveedor_condicion_iva: form.proveedor_condicion_iva,
        tipo_documento: "CUIT",
        mes_iva: fecha.getMonth() + 1,
        anio_iva: fecha.getFullYear(),
        tipo_comprobante: form.tipo_comprobante,
        letra: form.letra,
        punto_venta: form.punto_venta,
        numero: form.numero,
        fecha: form.fecha,
        fecha_vencimiento: form.fecha_vencimiento,
        concepto: "PRODUCTOS",
        moneda: "PES",
        cotizacion: 1,
        condicion_pago: "CONTADO",
        rubro_gasto: "",
        observaciones: "Cargada desde la app de compras (OCR)",
        afecta_caja: false,
        exento_no_gravado: Number(form.exento_no_gravado || 0),
        iva_detalles: form.iva_detalles.map((x: any) => {
          const bruto = Number(x.total_con_iva || 0);
          const rate = Number(x.alicuota || 0);
          const neto = rate ? bruto / (1 + rate / 100) : bruto;
          return { alicuota: rate, neto: Math.round(neto * 100) / 100, iva: Math.round((bruto - neto) * 100) / 100, total_con_iva: bruto };
        }),
        retenciones: [],
        total: t.total,
      });
      setOk("Compra cargada correctamente.");
      setForm(null);
      setArchivo(null);
      setPreview("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLeyendo(false);
    }
  }

  const t = totales();

  return <div className="mobile-app">
    <div className="mobile-hero">
      <h2>Cargar compra</h2>
      <p>Sacale una foto a la factura del proveedor: se leen los datos y los confirmás.</p>
    </div>

    {error && <div className="error-box">{error}</div>}
    {ok && <div className="success-box">{ok}</div>}

    <div className="mobile-grid">
      <button className="mobile-action" onClick={() => fotoRef.current?.click()}><Camera size={22} /><strong>Sacar foto</strong><span>Factura del proveedor</span></button>
      <button className="mobile-action" onClick={() => galeriaRef.current?.click()}><Upload size={22} /><strong>Elegir foto</strong><span>Desde la galería</span></button>
    </div>
    <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { elegir(e.target.files?.[0] || null); e.target.value = ""; }} />
    <input ref={galeriaRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { elegir(e.target.files?.[0] || null); e.target.value = ""; }} />

    {preview && <div className="mobile-card">
      <img src={preview} alt="Factura" style={{ width: "100%", borderRadius: 10, maxHeight: 320, objectFit: "contain" }} />
      {!form && <button className="mobile-btn-primario" disabled={leyendo} onClick={leer}>{leyendo ? "Leyendo la factura..." : "LEER LA FACTURA (OCR)"}</button>}
    </div>}

    {form && <div className="mobile-card">
      <h3>Datos leídos {form.confianza ? `(confianza ${form.confianza})` : ""}</h3>
      <p>Revisalos y corregí lo que haga falta.</p>
      <label className="mobile-obs">Proveedor<input value={form.proveedor_nombre} onChange={(e) => patch("proveedor_nombre", e.target.value)} /></label>
      <label className="mobile-obs">CUIT<input value={form.proveedor_documento} onChange={(e) => patch("proveedor_documento", e.target.value)} /></label>
      <label className="mobile-obs">Condición IVA<select value={form.proveedor_condicion_iva} onChange={(e) => patch("proveedor_condicion_iva", e.target.value)}><option>RESPONSABLE INSCRIPTO</option><option>MONOTRIBUTO</option><option>EXENTO</option><option>CONSUMIDOR FINAL</option></select></label>
      <label className="mobile-obs">Comprobante<select value={form.tipo_comprobante} onChange={(e) => patch("tipo_comprobante", e.target.value)}><option>FACTURA</option><option>NOTA DE CRÉDITO</option><option>NOTA DE DÉBITO</option><option>RECIBO</option></select></label>
      <label className="mobile-obs">Letra<select value={form.letra} onChange={(e) => patch("letra", e.target.value)}><option>A</option><option>B</option><option>C</option></select></label>
      <label className="mobile-obs">Punto de venta<input type="number" min="1" value={form.punto_venta} onFocus={(e) => e.currentTarget.select()} onChange={(e) => patch("punto_venta", Number(e.target.value) || 1)} /></label>
      <label className="mobile-obs">Número<input value={form.numero} onChange={(e) => patch("numero", e.target.value)} /></label>
      <label className="mobile-obs">Fecha<input type="date" value={form.fecha} onChange={(e) => patch("fecha", e.target.value)} /></label>
      <label className="mobile-obs">Vencimiento<input type="date" value={form.fecha_vencimiento} onChange={(e) => patch("fecha_vencimiento", e.target.value)} /></label>

      <h4>IVA</h4>
      {form.iva_detalles.map((x: any, i: number) => <div className="mobile-linea" key={i}>
        <select value={x.alicuota} onChange={(e) => patchIva(i, "alicuota", Number(e.target.value))}>
          <option value={0}>0%</option><option value={2.5}>2,5%</option><option value={5}>5%</option><option value={10.5}>10,5%</option><option value={21}>21%</option><option value={27}>27%</option>
        </select>
        <input type="number" min="0" step="any" placeholder="Total con IVA" value={x.total_con_iva} onFocus={(e) => e.currentTarget.select()} onChange={(e) => patchIva(i, "total_con_iva", Number(e.target.value) || 0)} />
        {form.iva_detalles.length > 1 && <button onClick={() => setForm((f: any) => ({ ...f, iva_detalles: f.iva_detalles.filter((_: any, n: number) => n !== i) }))}><Trash2 size={15} /></button>}
      </div>)}
      <button className="mobile-btn-sec" onClick={() => setForm((f: any) => ({ ...f, iva_detalles: [...f.iva_detalles, { alicuota: 21, total_con_iva: 0 }] }))}><Plus size={15} /> Agregar alícuota</button>

      <label className="mobile-obs">Exento / no gravado<input type="number" min="0" step="any" value={form.exento_no_gravado} onFocus={(e) => e.currentTarget.select()} onChange={(e) => patch("exento_no_gravado", Number(e.target.value) || 0)} /></label>

      <div className="mobile-total"><span>Neto</span><strong>$ {t.neto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>
      <div className="mobile-total"><span>IVA</span><strong>$ {t.iva.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>
      <div className="mobile-total"><span>TOTAL A PAGAR</span><strong>$ {t.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>

      <button className="mobile-btn-primario" disabled={leyendo} onClick={guardar}><Check size={18} /> {leyendo ? "Guardando..." : "CONFIRMAR Y CARGAR COMPRA"}</button>
      <button className="mobile-btn-sec" onClick={() => { setForm(null); setArchivo(null); setPreview(""); }}><RotateCcw size={15} /> Empezar de nuevo</button>
    </div>}
  </div>;
}
