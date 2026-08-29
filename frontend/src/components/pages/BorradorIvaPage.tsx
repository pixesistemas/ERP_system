import { useState, useEffect } from "react";
import { Printer, RefreshCw, FileSpreadsheet } from "lucide-react";
import { erpApi } from "../../services/api";

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAlic = (n: number) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const excelNum = (n: number) => String(Number(n || 0).toFixed(2)).replace(".", ",");

export function BorradorIvaPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [pv, setPv] = useState(0);
  const [pointsOfSale, setPointsOfSale] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [restCredito, setRestCredito] = useState("");
  const [restDebito, setRestDebito] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { erpApi.listPointsOfSale().then(r => setPointsOfSale(r.pointsOfSale || [])).catch(() => {}); }, []);

  async function load(m = month, y = year, p = pv) {
    setError("");
    try {
      const r = await erpApi.getBorradorIva(m, y, p || undefined);
      setData(r);
      setRestCredito(String(Number(r.resumen?.restitucionCredito || 0)));
      setRestDebito(String(Number(r.resumen?.restitucionDebito || 0)));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function guardarAjuste(tipo: string, importe: string) {
    try {
      await erpApi.saveBorradorIvaAjuste({ mes_iva: month, anio_iva: year, tipo, importe: Number(importe.replace(",", ".")) || 0 });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function renombrarRubro(id: number, actual: string) {
    const nombre = prompt("Nombre del rubro:", actual);
    if (!nombre || !nombre.trim() || nombre.trim() === actual) return;
    setBusy(true);
    try {
      await erpApi.renameBorradorIvaRubro(id, nombre.trim());
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function exportarExcel() {
    if (!data) return;
    const c = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(c(`BORRADOR DE LIBRO IVA ${String(month).padStart(2, "0")}/${year} · Punto de venta: ${pvLabel}`));
    lines.push(c(`De: ${emp.razonSocial || emp.nombreFantasia || ""}`));
    if (emp.email) lines.push(c(`Mail: ${emp.email}`));
    if (emp.direccion) lines.push(c(emp.direccion));
    if (emp.telefono) lines.push(c(`Teléfono: ${emp.telefono}${emp.whatsapp ? ` Whatsapp: ${emp.whatsapp}` : ""}`));
    lines.push("");
    lines.push(`RESUMEN;IVA VENTAS;IVA COMPRAS;TOTAL A PAGAR/A FAVOR`);
    lines.push(`;${excelNum(resumen.ivaVentas)};${excelNum(resumen.ivaCompras)};${excelNum(Math.abs(resultado))}${resultado < 0 ? " (a favor)" : ""}`);
    lines.push("");
    lines.push(`VENTAS — DÉBITO FISCAL;Tipo responsable;Alícuota;Total;Total gravado;Total IVA`);
    for (const r of (data.ventasPorRubro || [])) {
      lines.push(`RUBRO: ${c(r.rubro)};;;;;`);
      for (const f of r.filas) lines.push(`;${c(f.tipoResponsable)};${c(`${fmtAlic(f.alicuota)}%`)};${excelNum(f.total)};${excelNum(f.gravado)};${excelNum(f.iva)}`);
      lines.push(`TOTAL EN RUBRO -> ${c(r.rubro)};;;;${excelNum(r.totalRubro.gravado)};${excelNum(r.totalRubro.iva)}`);
    }
    lines.push(`SUMA DE TODOS LOS RUBROS ->;;;${excelNum(data.sumaRubros.total)};${excelNum(data.sumaRubros.gravado)};${excelNum(data.sumaRubros.iva)}`);
    lines.push("");
    lines.push(`COMPRAS — CRÉDITO FISCAL;Comprobantes;Total;Neto gravado;IVA`);
    lines.push(`;${data.compras.cantidad};${excelNum(data.compras.total)};${excelNum(data.compras.gravado)};${excelNum(data.compras.iva)}`);
    lines.push(`Restitución de crédito fiscal;;${excelNum(resumen.restitucionCredito)};;;;`);
    lines.push(`Restitución de débito fiscal;;${excelNum(resumen.restitucionDebito)};;;;`);
    lines.push("");
    lines.push(`LISTADOS DE RETENCIONES Y PERCEPCIONES;CUIT;FECHA;PUNT.V;NUMERO;RAZON SOCIAL;TIPO;IMPORTE`);
    for (const r of (data.retencionesPercepciones || [])) lines.push(`;${c(r.cuit || "-")};${c(r.fecha || "-")};${String(r.puntoVenta).padStart(4, "0")};${c(String(r.numero))};${c(r.razonSocial)};${c(r.tipo)};${excelNum(r.importe)}`);
    const csv = "\uFEFF" + lines.join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `borrador-iva-${String(month).padStart(2, "0")}-${year}-pv${pv || "todos"}.csv`;
    a.click();
  }

  const resumen = data?.resumen || {};
  const resultado = Number(resumen.resultado || 0);
  const emp = data?.empresa || {};
  const pvLabel = pv ? `${String(pv).padStart(4, "0")}${pointsOfSale.find((p: any) => Number(p.numero) === pv)?.nombre ? ` · ${pointsOfSale.find((p: any) => Number(p.numero) === pv).nombre}` : ""}` : "TODOS";
  const pvObj = pv ? pointsOfSale.find((p: any) => Number(p.numero) === pv) : null;

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Borrador IVA</h3><p>Resumen del débito fiscal por rubro y tipo de responsable, crédito fiscal de compras, restituciones y retenciones/percepciones del período.</p></div>
      <div className="toolbar-actions"><button onClick={exportarExcel}><FileSpreadsheet size={16} /> Excel</button><button onClick={() => window.print()}><Printer size={16} /> Imprimir</button></div>
    </div>
    <div className="vat-period">
      <label>Mes<select value={month} onChange={e => { const v = Number(e.target.value); setMonth(v); load(v, year, pv); }}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2026, i, 1).toLocaleString("es-AR", { month: "long" })}</option>)}</select></label>
      <label>Año<input type="number" value={year} onChange={e => { const v = Number(e.target.value); setYear(v); load(month, v, pv); }} /></label>
      <label>Punto de venta<select value={pv} onChange={e => { const v = Number(e.target.value); setPv(v); load(month, year, v); }}><option value={0}>TODOS</option>{pointsOfSale.map((p: any) => <option key={p.id} value={p.numero}>{p.numero} · {p.nombre || `PV ${p.numero}`}</option>)}</select></label>
      <button onClick={() => load()}><RefreshCw size={14} /> Actualizar</button>
    </div>
    {error && <div className="error-box">{error}</div>}

    {data && <div className="borrador-empresa">
      <div><strong>BORRADOR DE LIBRO IVA</strong><span>{`${String(month).padStart(2, "0")}/${year}`} · Punto de venta: {pvLabel}</span></div>
      <div className="borrador-empresa-datos">
        {emp.razonSocial || emp.nombreFantasia ? <span>De: {emp.razonSocial || emp.nombreFantasia}</span> : null}
        {emp.email ? <span>Mail: {emp.email}</span> : null}
        {pvObj?.direccion || emp.direccion ? <span>{pvObj?.direccion || emp.direccion}</span> : null}
        {emp.telefono ? <span>Teléfono: {emp.telefono}{emp.whatsapp ? ` Whatsapp: ${emp.whatsapp}` : ""}</span> : null}
      </div>
    </div>}

    <div className="vat-summary">
      <div><span>IVA VENTAS (débito)</span><strong>$ {fmt(resumen.ivaVentas)}</strong></div>
      <div><span>IVA COMPRAS (crédito)</span><strong>$ {fmt(resumen.ivaCompras)}</strong></div>
      <div className={resultado >= 0 ? "positive" : "negative"}><span>TOTAL GENERAL DE IVA A PAGAR/A FAVOR</span><strong>$ {fmt(Math.abs(resultado))} {resultado < 0 ? "a favor" : ""}</strong></div>
    </div>

    {data && <><div className="borrador-iva-block">
      <h4>VENTAS — DÉBITO FISCAL <span className="borrador-pv-tag">Punto de venta: {pvLabel}</span></h4>
      {(data.ventasPorRubro || []).map((r: any) => <div key={r.rubro} className="borrador-rubro">
        <div className="borrador-rubro-title">
          <strong>{r.rubro}</strong>
          {r.rubroId ? <button className="link-button" disabled={busy} onClick={() => renombrarRubro(r.rubroId, r.rubro)}>renombrar</button> : null}
        </div>
        <table className="borrador-table">
          <thead><tr><th>Tipo Responsable</th><th>Alícuota</th><th>Total</th><th>Total Gravado</th><th>Total IVA</th></tr></thead>
          <tbody>{r.filas.map((f: any, i: number) => <tr key={i}><td>{f.tipoResponsable}</td><td>IVA {fmtAlic(f.alicuota)}%</td><td>$ {fmt(f.total)}</td><td>$ {fmt(f.gravado)}</td><td>$ {fmt(f.iva)}</td></tr>)}
            <tr className="borrador-total-rubro"><td colSpan={3}><strong>TOTAL EN RUBRO --&gt; {r.rubro}</strong></td><td><strong>$ {fmt(r.totalRubro.gravado)}</strong></td><td><strong>$ {fmt(r.totalRubro.iva)}</strong></td></tr>
          </tbody>
        </table>
      </div>)}
      <div className="borrador-suma-rubros"><strong>SUMA DE TODOS LOS RUBROS --&gt;&gt;</strong><span>$ {fmt(data.sumaRubros.total)}</span><span>$ {fmt(data.sumaRubros.gravado)}</span><span>$ {fmt(data.sumaRubros.iva)}</span></div>
    </div>

    <div className="borrador-iva-block print-break">
      <h4>COMPRAS — CRÉDITO FISCAL</h4>
      <div className="borrador-compras-resumen">
        <div><span>Comprobantes cargados</span><strong>{data.compras.cantidad}</strong></div>
        <div><span>Total compras</span><strong>$ {fmt(data.compras.total)}</strong></div>
        <div><span>Neto gravado</span><strong>$ {fmt(data.compras.gravado)}</strong></div>
        <div><span>IVA compras</span><strong>$ {fmt(data.compras.iva)}</strong></div>
      </div>
      <div className="borrador-restituciones">
        <label>Restitución de crédito fiscal<strong>$ {fmt(resumen.restitucionCredito)}</strong><input value={restCredito} onChange={e => setRestCredito(e.target.value)} onBlur={() => guardarAjuste("RESTITUCION_CREDITO", restCredito)} /></label>
        <label>Restitución de débito fiscal<strong>$ {fmt(resumen.restitucionDebito)}</strong><input value={restDebito} onChange={e => setRestDebito(e.target.value)} onBlur={() => guardarAjuste("RESTITUCION_DEBITO", restDebito)} /></label>
      </div>
    </div>

    <div className="borrador-iva-block print-break">
      <h4>LISTADOS DE RETENCIONES Y PERCEPCIONES</h4>
      <table className="borrador-table">
        <thead><tr><th>CUIT</th><th>FECHA</th><th>PUNT.V</th><th>NUMERO</th><th>RAZON SOCIAL</th><th>TIPO</th><th>IMPORTE</th></tr></thead>
        <tbody>{(data.retencionesPercepciones || []).map((r: any, i: number) => <tr key={i}><td>{r.cuit || "-"}</td><td>{r.fecha || "-"}</td><td>{String(r.puntoVenta).padStart(4, "0")}</td><td>{r.numero}</td><td>{r.razonSocial}</td><td>{r.tipo}</td><td>$ {fmt(r.importe)}</td></tr>)}
          {!(data.retencionesPercepciones || []).length && <tr><td colSpan={7} className="empty-table">Sin retenciones ni percepciones en el período.</td></tr>}
        </tbody>
      </table>
    </div></>}
  </div>;
}