import { useState } from "react";
import { Save, Download } from "lucide-react";
import { api } from "../../services/api";

const COLUMNAS: Record<string, string> = {
  codigo: "codigo", "código": "codigo", code: "codigo", sku: "codigo",
  barras: "codigoBarra", codigobarra: "codigoBarra", ean: "codigoBarra",
  descripcion: "descripcion", producto: "descripcion", nombre: "descripcion", articulo: "descripcion",
  precio: "precio", precioventa: "precio", precio_venta: "precio",
  costo: "costo", preciocosto: "costo", precio_costo: "costo",
  iva: "iva", unidad: "unidad",
};

function normalizarFila(row: any) {
  const out: any = { _fila: row._fila };
  for (const [key, value] of Object.entries(row)) {
    if (key === "_fila") continue;
    const destino = COLUMNAS[String(key).toLowerCase()];
    if (destino && out[destino] === undefined) out[destino] = String(value ?? "").trim();
  }
  return out;
}

export function ImportProductsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modo, setModo] = useState("AMBOS");
  const [resultado, setResultado] = useState<any>(null);
  const [existentes, setExistentes] = useState<Record<string, boolean>>({});

  async function previewFile() {
    setError("");
    setResultado(null);
    setPreview([]);
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv") {
      setError("La previsualización inmediata funciona con CSV. Para XLS/XLSX exportá primero la hoja como CSV.");
      return;
    }
    try {
      const raw = await file.text();
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setError("El archivo no contiene filas para importar."); return; }
      const separator = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(separator).map((x: string) => x.trim().replace(/^"|"$/g, ""));
      const filas = lines.slice(1, 501).map((line, index) => {
        const values = line.split(separator).map((x: string) => x.trim().replace(/^"|"$/g, ""));
        return headers.reduce((acc: any, h, i) => { acc[h || `columna_${i + 1}`] = values[i] ?? ""; return acc; }, { _fila: index + 2 });
      });
      setPreview(filas.map(normalizarFila));
      const r: any = await api.listProducts("");
      const map: Record<string, boolean> = {};
      for (const p of r.products || []) if (p.codigo) map[String(p.codigo).toLowerCase()] = true;
      setExistentes(map);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function confirmar() {
    setBusy(true);
    setError("");
    setResultado(null);
    try {
      const r: any = await api.importProducts(modo, preview);
      setResultado(r);
      await previewFile();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="products-page"><div className="settings-card import-card">
    <h3>Importar y actualizar productos</h3>
    <p>El archivo debe traer una columna de <b>código</b>: si el código ya existe se actualiza el producto (precio, costo, descripción…); si no, se crea uno nuevo. Columnas compatibles: código, barras, descripción/producto, precio, costo, IVA y unidad.</p>
    <input type="file" accept=".csv,.xlsx,.xls" onChange={e => { setFile(e.target.files?.[0] || null); setPreview([]); setResultado(null); setError(""); }} />
    <div className="inline-actions">
      <label>Modo
        <select value={modo} onChange={e => setModo(e.target.value)}>
          <option value="AMBOS">Crear y actualizar (por código)</option>
          <option value="NUEVOS">Solo crear productos nuevos</option>
          <option value="ACTUALIZAR">Solo actualizar existentes</option>
        </select>
      </label>
      <button className="primary-action" disabled={!file} onClick={previewFile}><Download /> Previsualizar importación</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    {preview.length > 0 && <div className="import-preview">
      <div className="success-box">Se previsualizan {preview.length} filas. Ningún dato se guardó todavía.</div>
      <div className="table-scroll"><table><thead><tr><th>Fila</th><th>Código</th><th>Descripción</th><th>Precio</th><th>Costo</th><th>IVA</th><th>Estado</th></tr></thead><tbody>{preview.map((r: any) => { const existe = r.codigo && existentes[String(r.codigo).toLowerCase()]; return <tr key={r._fila}><td>{r._fila}</td><td>{r.codigo || "-"}</td><td>{r.descripcion || "-"}</td><td>{r.precio || "-"}</td><td>{r.costo || "-"}</td><td>{r.iva || "21"}</td><td>{existe ? <span className="fiscal-warn">EXISTENTE (se actualiza)</span> : <span className="fiscal-ok">NUEVO (se crea)</span>}</td></tr>; })}</tbody></table></div>
      <button className="primary-action" disabled={busy} onClick={confirmar}><Save size={16} /> {busy ? "Importando…" : `Confirmar importación (${preview.length} filas)`}</button>
    </div>}
    {resultado && <div className="import-result">
      <div className="success-box">Importación finalizada: {resultado.resumen?.creados || 0} creados, {resultado.resumen?.actualizados || 0} actualizados, {resultado.resumen?.errores || 0} con error.</div>
      {(resultado.actualizados?.length > 0 || resultado.creados?.length > 0) && <div className="table-scroll"><table><thead><tr><th>Código</th><th>Descripción</th><th>Precio</th><th>Resultado</th></tr></thead><tbody>{[...(resultado.creados || []).map((x: any) => ({ ...x, resultado: "Creado" })), ...(resultado.actualizados || []).map((x: any) => ({ ...x, resultado: `Actualizado (antes $ ${Number(x.precioAnterior).toLocaleString("es-AR", { minimumFractionDigits: 2 })})` }))].map((x: any, i: number) => <tr key={i}><td>{x.codigo}</td><td>{x.descripcion}</td><td>$ {Number(x.precio).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td><td>{x.resultado}</td></tr>)}</tbody></table></div>}
      {resultado.errores?.length > 0 && <div className="error-box">{resultado.errores.map((e: any, i: number) => <div key={i}>Fila {e.fila || "-"} · {e.codigo || "sin código"}: {e.error}</div>)}</div>}
    </div>}
  </div></div>;
}