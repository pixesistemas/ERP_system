import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { api } from "../../services/api";
import { useServerRows } from "../../hooks/useServerStorage";

type Formato = "ACTUAL" | "A4_1" | "A4_8" | "A4_6" | "OFERTA";
type ProductoEtiqueta = any;

const FORMATOS: { id: Formato; nombre: string; detalle: string }[] = [
  { id: "ACTUAL", nombre: "Actual", detalle: "Etiqueta chica, 24 por hoja A4" },
  { id: "A4_1", nombre: "1 por hoja (vidriera)", detalle: "Etiqueta grande para exhibición" },
  { id: "A4_8", nombre: "8 por hoja", detalle: "2 columnas × 4 filas" },
  { id: "A4_6", nombre: "6 por hoja", detalle: "2 columnas × 3 filas" },
  { id: "OFERTA", nombre: "Oferta grande", detalle: "2 etiquetas grandes por hoja" },
];

const POR_HOJA: Record<Formato, number> = { ACTUAL: 24, A4_1: 1, A4_8: 8, A4_6: 6, OFERTA: 2 };

const LABEL_CSS = `
.shelf-labels-page .shelf-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;padding:14px}
.shelf-labels-page .shelf-filters label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;text-transform:uppercase;color:var(--muted,#64748b)}
.shelf-labels-page .shelf-filters input,.shelf-labels-page .shelf-filters select{padding:8px 10px;border:1px solid var(--line,#cbd5e1);border-radius:8px;font-size:14px;font-weight:400;text-transform:none;color:var(--text,#111)}
.shelf-labels-page .shelf-selection-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;margin:12px 0}
.shelf-labels-page .shelf-selection-bar .shelf-count{margin-right:auto;font-weight:700}
.shelf-labels-page .shelf-selection-bar button{padding:8px 12px;border:1px solid var(--line,#cbd5e1);border-radius:8px;background:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.shelf-labels-page .shelf-selection-bar button.primary-action{background:var(--primary,#3b82f6);color:#fff;border-color:var(--primary,#3b82f6);font-weight:700}
.shelf-labels-page .shelf-selection-bar select{padding:8px 10px;border:1px solid var(--line,#cbd5e1);border-radius:8px}
.shelf-labels-page .shelf-preview{background:#e2e8f0;padding:16px;border-radius:12px;overflow:auto}
.shelf-labels-page .shelf-print-area{display:flex;flex-direction:column;gap:16px;align-items:center}
.shelf-labels-page .shelf-page{width:210mm;height:297mm;background:#fff;color:#111;padding:6mm;box-sizing:border-box;box-shadow:0 2px 10px rgba(15,23,42,.18);display:grid;gap:2.5mm;overflow:hidden}
.shelf-labels-page .shelf-page-actual{grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(8,1fr)}
.shelf-labels-page .shelf-page-actual .shelf-desc{font-size:11px;-webkit-line-clamp:2}
.shelf-labels-page .shelf-page-actual .shelf-price{font-size:18px}
.shelf-labels-page .shelf-page-a4_8{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(4,1fr);gap:4mm}
.shelf-labels-page .shelf-page-a4_6{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(3,1fr);gap:4mm}
.shelf-labels-page .shelf-page-a4_1{display:flex;align-items:stretch;justify-content:stretch;padding:10mm}
.shelf-labels-page .shelf-page-oferta{grid-template-columns:1fr;grid-template-rows:repeat(2,1fr);gap:5mm}
.shelf-labels-page .shelf-label{border:0.35mm solid #94a3b8;border-radius:2mm;padding:2.5mm;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;break-inside:avoid;background:#fff;min-height:0}
.shelf-labels-page .shelf-desc{font-weight:800;line-height:1.12;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;font-size:12px}
.shelf-labels-page .shelf-price{font-weight:900;letter-spacing:-.02em;line-height:1;font-size:20px;white-space:nowrap}
.shelf-labels-page .shelf-code{font-family:ui-monospace,Consolas,monospace;font-weight:700;letter-spacing:.06em;text-align:center;white-space:nowrap;overflow:hidden;font-size:11px}
.shelf-labels-page .shelf-no-code{font-size:10px;color:#64748b;text-align:center;border-top:1px dashed #cbd5e1;border-bottom:1px dashed #cbd5e1;padding:3px 0}
.shelf-labels-page .shelf-foot{display:flex;justify-content:space-between;gap:4px;font-size:10px;color:#475569;line-height:1.15}
.shelf-labels-page .shelf-foot span:last-child{white-space:nowrap}
.shelf-labels-page .shelf-page-a4_8 .shelf-desc{font-size:17px;-webkit-line-clamp:3}
.shelf-labels-page .shelf-page-a4_8 .shelf-price{font-size:34px}
.shelf-labels-page .shelf-page-a4_8 .shelf-code{font-size:16px}
.shelf-labels-page .shelf-page-a4_8 .shelf-foot{font-size:12px}
.shelf-labels-page .shelf-page-a4_6 .shelf-desc{font-size:22px;-webkit-line-clamp:4}
.shelf-labels-page .shelf-page-a4_6 .shelf-price{font-size:46px}
.shelf-labels-page .shelf-page-a4_6 .shelf-code{font-size:20px}
.shelf-labels-page .shelf-page-a4_6 .shelf-foot{font-size:14px}
.shelf-labels-page .shelf-page-a4_1 .shelf-label{padding:12mm;border-width:1mm;border-radius:4mm;flex:1}
.shelf-labels-page .shelf-page-a4_1 .shelf-desc{font-size:44px;line-height:1.15;-webkit-line-clamp:6}
.shelf-labels-page .shelf-page-a4_1 .shelf-price{font-size:110px}
.shelf-labels-page .shelf-page-a4_1 .shelf-code{font-size:38px}
.shelf-labels-page .shelf-page-a4_1 .shelf-foot{font-size:20px}
.shelf-labels-page .shelf-page-oferta .shelf-label{padding:8mm;border:1.5mm solid #dc2626;border-radius:4mm;position:relative}
.shelf-labels-page .shelf-oferta-banner{background:#dc2626;color:#fff;font-weight:900;text-align:center;letter-spacing:.18em;padding:3mm;border-radius:2mm;font-size:30px}
.shelf-labels-page .shelf-oferta-desc{font-size:34px;font-weight:800;line-height:1.15;text-align:center;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.shelf-labels-page .shelf-oferta-price{font-size:92px;font-weight:900;line-height:1;text-align:center;color:#dc2626}
.shelf-labels-page .shelf-page-oferta .shelf-code{font-size:26px}
.shelf-labels-page .shelf-page-oferta .shelf-foot{font-size:18px;color:#334155}
@media print{
  .shelf-labels-page .shelf-page{box-shadow:none;margin:0;break-after:page;page-break-after:always}
  .shelf-labels-page .shelf-page:last-child{break-after:auto;page-break-after:auto}
}
`;

function fechaCorta(valor: any) {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function precioFmt(valor: any) {
  return Number(valor || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CodigoBarras({ valor }: { valor: string }) {
  if (!valor) return <div className="shelf-no-code">SIN CÓDIGO DE BARRAS</div>;
  return <div className="shelf-code">{valor}</div>;
}

function Etiqueta({ producto, formato }: { producto: ProductoEtiqueta; formato: Formato }) {
  const codigoBarras = String(producto.codigoBarra || producto.codigo_barra || "").trim() || String(producto.codigo || "").trim();
  const actualizado = fechaCorta(producto.updatedAt || producto.updated_at);

  if (formato === "OFERTA") {
    return <div className="shelf-label">
      <div className="shelf-oferta-banner">OFERTA</div>
      <div className="shelf-oferta-desc" title={producto.descripcion}>{producto.descripcion}</div>
      <div className="shelf-oferta-price">$ {precioFmt(producto.precio)}</div>
      <CodigoBarras valor={codigoBarras} />
      <div className="shelf-foot"><span>Cód. {producto.codigo || codigoBarras || "—"}</span><span>Act. {actualizado}</span></div>
    </div>;
  }

  return <div className="shelf-label">
    <div className="shelf-desc" title={producto.descripcion}>{producto.descripcion}</div>
    <div className="shelf-price">$ {precioFmt(producto.precio)}</div>
    <CodigoBarras valor={codigoBarras} />
    <div className="shelf-foot"><span>{producto.codigo || codigoBarras || "—"}</span><span>Act. {actualizado}</span></div>
  </div>;
}

function Hoja({ productos, formato }: { productos: ProductoEtiqueta[]; formato: Formato }) {
  return <div className={`shelf-page shelf-page-${formato.toLowerCase()}`}>
    {productos.map((producto) => <Etiqueta key={producto.id || producto.codigo} producto={producto} formato={formato} />)}
  </div>;
}

function dividir<T>(lista: T[], tamano: number): T[][] {
  const paginas: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) paginas.push(lista.slice(i, i + tamano));
  return paginas;
}

export function ShelfLabelsPage() {
  const [products, setProducts] = useState<ProductoEtiqueta[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState("TODOS");
  const [texto, setTexto] = useState("");
  const [rubroId, setRubroId] = useState("");
  const [subrubroId, setSubrubroId] = useState("");
  const [marcaId, setMarcaId] = useState("");
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [orden, setOrden] = useState("DESCRIPCION");
  const [formato, setFormato] = useState<Formato>("ACTUAL");
  const [notice, setNotice] = useState("");
  const [catalogs] = useServerRows("afip_catalogs_v34", [{ id: 1, tipo: "RUBRO", nombre: "Ferretería" }, { id: 2, tipo: "SUBRUBRO", nombre: "Tornillos", rubroId: 1 }]);
  const rubros = catalogs.filter((c: any) => c.tipo === "RUBRO");
  const subrubros = catalogs.filter((c: any) => c.tipo === "SUBRUBRO");
  const marcas = catalogs.filter((c: any) => c.tipo === "MARCA");

  useEffect(() => {
    api.listProducts("").then((r: any) => setProducts((r.products || []).map((p: any) => ({ ...p, updatedAt: p.updatedAt || p.updated_at || null }))));
  }, []);

  const cutoff = filter === "7_DIAS" ? Date.now() - 7 * 86400000 : filter === "30_DIAS" ? Date.now() - 30 * 86400000 : 0;
  const q = (texto || "").toLowerCase().trim();
  const min = Number(String(precioMin).replace(",", ".")) || 0;
  const max = Number(String(precioMax).replace(",", ".")) || 0;

  const visibles = useMemo(() => products.filter((p: any) =>
    (!cutoff || new Date(p.updatedAt || 0).getTime() >= cutoff) &&
    (!q || `${p.codigo} ${p.codigoBarra || ""} ${p.descripcion}`.toLowerCase().includes(q)) &&
    (!rubroId || String(p.rubroId) === String(rubroId)) &&
    (!subrubroId || String(p.subrubroId) === String(subrubroId)) &&
    (!marcaId || String(p.marcaId) === String(marcaId)) &&
    (!min || Number(p.precio) >= min) &&
    (!max || Number(p.precio) <= max)
  ).sort((a: any, b: any) => {
    const av = orden === "PRECIO_ASC" ? Number(a.precio) : orden === "PRECIO_DESC" ? -Number(a.precio) : String(a.descripcion || "").toLowerCase();
    const bv = orden === "PRECIO_ASC" ? Number(b.precio) : orden === "PRECIO_DESC" ? -Number(b.precio) : String(b.descripcion || "").toLowerCase();
    return av > bv ? 1 : av < bv ? -1 : 0;
  }), [products, cutoff, q, rubroId, subrubroId, marcaId, min, max, orden]);

  const elegidos = visibles.filter((p: any) => selected[Number(p.id)]);
  const paginas = dividir(elegidos, POR_HOJA[formato]);

  function toggle(id: number) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function seleccionarVisibles() {
    setSelected((prev) => ({ ...prev, ...Object.fromEntries(visibles.map((p: any) => [Number(p.id), true])) }));
  }

  function imprimir() {
    if (!elegidos.length) {
      setNotice("Seleccioná al menos un producto para imprimir.");
      return;
    }
    setNotice("");
    const css = LABEL_CSS + "\n@page{size:A4;margin:0}body{margin:0;background:#fff}.shelf-page{box-shadow:none!important}";
    const contenido = document.querySelector(".shelf-print-area")?.innerHTML || "";
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    iframe.onload = () => setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 60000);
    }, 120);
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas de góndola</title><style>${css}</style></head><body><div class="shelf-labels-page">${contenido}</div></body></html>`);
    doc.close();
  }

  return <div className="products-page shelf-labels-page">
    <style>{LABEL_CSS}</style>
    <div className="products-toolbar">
      <div><h3>Etiquetas de góndola</h3><p>Elegí el formato, filtrá productos e imprimí con código de barras y fecha de actualización.</p></div>
      <button className="primary-action" onClick={imprimir}><Printer size={18} /> Imprimir</button>
    </div>
    {notice && <div className="pos-notice">{notice}</div>}
    <div className="products-card">
      <div className="shelf-filters">
        <label>Buscar<input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, barras o descripción" /></label>
        <label>Rubro<select value={rubroId} onChange={(e) => { setRubroId(e.target.value); setSubrubroId(""); }}><option value="">Todos</option>{rubros.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Subrubro<select value={subrubroId} onChange={(e) => setSubrubroId(e.target.value)}><option value="">Todos</option>{subrubros.filter((c: any) => !rubroId || String(c.rubroId) === String(rubroId)).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Marca<select value={marcaId} onChange={(e) => setMarcaId(e.target.value)}><option value="">Todas</option>{marcas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Actualización<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="TODOS">Todos</option><option value="7_DIAS">Últimos 7 días</option><option value="30_DIAS">Últimos 30 días</option></select></label>
        <label>Precio desde<input inputMode="decimal" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} placeholder="0" /></label>
        <label>Precio hasta<input inputMode="decimal" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} placeholder="Sin límite" /></label>
        <label>Orden<select value={orden} onChange={(e) => setOrden(e.target.value)}><option value="DESCRIPCION">Descripción</option><option value="PRECIO_ASC">Menor precio</option><option value="PRECIO_DESC">Mayor precio</option></select></label>
      </div>
    </div>
    <div className="products-card shelf-selection-bar">
      <span className="shelf-count">{elegidos.length} de {visibles.length} productos seleccionados</span>
      <button type="button" onClick={seleccionarVisibles}>Seleccionar visibles</button>
      <button type="button" onClick={() => setSelected({})}>Quitar selección</button>
      <label>Formato <select value={formato} onChange={(e) => setFormato(e.target.value as Formato)}>{FORMATOS.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
      <button type="button" className="primary-action" onClick={imprimir}><Printer size={16} /> Imprimir</button>
    </div>
    <div className="shelf-preview">
      {elegidos.length ? <div className="shelf-print-area">{paginas.map((pagina, index) => <Hoja key={index} productos={pagina} formato={formato} />)}</div> : <div className="empty-table">Seleccioná productos para ver la vista previa. {FORMATOS.find((f) => f.id === formato)?.detalle}</div>}
    </div>
    <div className="products-card">
      <table>
        <thead><tr><th></th><th>Código</th><th>Descripción</th><th>Precio</th><th>Actualizado</th></tr></thead>
        <tbody>{visibles.slice(0, 300).map((p: any) => <tr key={p.id}>
          <td><input type="checkbox" checked={Boolean(selected[Number(p.id)])} onChange={() => toggle(Number(p.id))} /></td>
          <td>{p.codigo || "—"}<small>{p.codigoBarra || ""}</small></td>
          <td><strong>{p.descripcion}</strong></td>
          <td>$ {precioFmt(p.precio)}</td>
          <td>{fechaCorta(p.updatedAt)}</td>
        </tr>)}</tbody>
      </table>
      {!visibles.length && <div className="empty-table">No hay productos con esos filtros.</div>}
      {visibles.length > 300 && <div className="empty-table">Mostrando los primeros 300 productos. Usá los filtros para acotar la lista.</div>}
    </div>
  </div>;
}
