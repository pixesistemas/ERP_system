import { useState, useEffect, useMemo } from "react";
import { Download, Printer, SlidersHorizontal, LayoutGrid, List, ArrowUpDown, Search, ChevronDown, ChevronRight, X } from "lucide-react";
import { erpApi, api } from "../../services/api";

/*
 * Motor de reportes de ventas: una sola pantalla configurable que agrupa
 * por vendedor / cliente / producto (N niveles), con modo detalle/resumen,
 * columnas visibles, ordenamiento, búsqueda, filtros y exportación.
 * Los datos se obtienen SIEMPRE del backend (reporteVentas).
 */

type FiltroVendedor = { id: number; nombre: string } | null;
type FiltroCliente = { id: number; nombre: string } | null;
type FiltroProducto = { id: number; nombre: string } | null;

const DIM_LABEL: Record<string, string> = {
  vendedor: "Vendedor",
  cliente: "Cliente",
  producto: "Producto",
};

const TIPOS_DISPONIBLES = [
  { tipo: "FACTURA", label: "Factura" },
  { tipo: "NOTA_X", label: "Nota de venta" },
  { tipo: "NOTA_PEDIDO", label: "Nota de pedido" },
  { tipo: "PRESUPUESTO", label: "Presupuesto" },
  { tipo: "REMITO", label: "Remito" },
  { tipo: "RESERVA", label: "Reserva" },
  { tipo: "NOTA_CREDITO", label: "Nota de crédito" },
  { tipo: "NOTA_DEBITO", label: "Nota de débito" },
];

type Line = {
  fecha: string;
  numero: string;
  pv: number;
  tipo: string;
  cliente: string;
  clienteDireccion: string;
  vendedor: string;
  estado: string;
  codigo: string;
  descripcion: string;
  cant: number;
  imp: number;
  anulado: boolean;
  productoId: any;
};

function buildLines(docs: any[]): Line[] {
  const out: Line[] = [];
  for (const d of docs) {
    const base = {
      fecha: String(d.fecha || "").slice(0, 10),
      numero: `${String(d.punto_venta || 1).padStart(4, "0")}-${String(d.numero || 0).padStart(8, "0")}`,
      pv: Number(d.punto_venta || 1),
      tipo: d.tipo || "",
      cliente: d.cliente_nombre || "CONSUMIDOR FINAL",
      clienteDireccion: d.cliente_direccion || "",
      vendedor: d.vendedor_nombre || "-",
      estado: d.estado || "",
      anulado: d.estado === "ANULADO" || Boolean(d.fecha_anulacion),
    };
    const items = Array.isArray(d.items) && d.items.length ? d.items : [];
    if (items.length) {
      for (const it of items) {
        out.push({
          ...base,
          codigo: it.codigo || "",
          descripcion: it.descripcion || "",
          cant: Number(it.cantidad || 0),
          imp: Number(it.total != null ? it.total : it.subtotal || 0),
          productoId: it.producto_id || null,
        });
      }
    } else {
      out.push({ ...base, codigo: "", descripcion: d.tipo || "", cant: 1, imp: Number(d.importe_total || 0), productoId: null });
    }
  }
  return out;
}

const dinero = (v: number) => `${Number(v) < 0 ? "-" : ""}$ ${Math.abs(Number(v)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCant = (v: number) => Number(v).toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtF = (s: string) => {
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("es-AR");
};
const signo = (l: Line) => (l.anulado ? -1 : 1);

const keyOf = (l: Line, dim: string) => {
  if (dim === "vendedor") return l.vendedor;
  if (dim === "cliente") return l.cliente;
  if (dim === "producto") return `${l.codigo ? l.codigo + " · " : ""}${l.descripcion}`;
  return "";
};

type Node = {
  dim: string;
  label: string;
  key: string;
  lines: Line[];
  children: Node[];
  cant: number;
  imp: number;
};

export function SalesReportsPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const hoy = () => new Date().toISOString().slice(0, 10);
  const hace30 = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [desde, setDesde] = useState(hace30());
  const [hasta, setHasta] = useState(hoy());
  const [tipos, setTipos] = useState<string[]>(["FACTURA", "NOTA_X", "NOTA_PEDIDO", "PRESUPUESTO", "REMITO"]);
  const [estado, setEstado] = useState("");
  const [vendedor, setVendedor] = useState<FiltroVendedor>(null);
  const [cliente, setCliente] = useState<FiltroCliente>(null);
  const [producto, setProducto] = useState<FiltroProducto>(null);
  const [codigo, setCodigo] = useState("");
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);

  const [grupo, setGrupo] = useState<string[]>(["vendedor"]);
  const [detalle, setDetalle] = useState(false);
  const [cols, setCols] = useState<Record<string, boolean>>({ vendedor: true, cliente: true, producto: true, codigo: true, cantidad: true, precio: true });
  const [orden, setOrden] = useState("vendedor");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [q, setQ] = useState("");

  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAgrupar, setShowAgrupar] = useState(false);
  const [showCampos, setShowCampos] = useState(false);
  const [showExportar, setShowExportar] = useState(false);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  useEffect(() => {
    erpApi.listPosCatalogs().then((r: any) => setVendedores(r.sellers || [])).catch(() => {});
    erpApi.listPosOperations().then(() => {}).catch(() => {});
  }, []);

  function toggleTipo(t: string) {
    setTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function toggleDim(d: string) {
    setGrupo(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }
  function toggleCol(k: string) {
    setCols(prev => ({ ...prev, [k]: !prev[k] }));
  }
  function toggleOrder() { setDir(d => d === "asc" ? "desc" : "asc"); }
  function cambiarOrden(o: string) {
    if (o === orden) { setDir(d => d === "asc" ? "desc" : "asc"); }
    else { setOrden(o); setDir("asc"); }
  }

  async function cargar() {
    setLoading(true); setError("");
    try {
      const r = await erpApi.reporteVentas({
        desde, hasta,
        tipos: tipos.length ? tipos : undefined,
        estado: estado || undefined,
        vendedor_id: vendedor?.id,
        cliente_id: cliente?.id,
        producto_id: producto?.id,
        codigo: codigo.trim() || undefined,
      });
      setDocs(r.documentos || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [desde, hasta, tipos, estado, vendedor, cliente, producto, codigo]);

  const lineas = useMemo(() => buildLines(docs), [docs]);

  const lineasFiltradas = useMemo(() => {
    if (!q.trim()) return lineas;
    const t = q.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return lineas.filter(l => norm(l.vendedor).includes(t) || norm(l.cliente).includes(t) || norm(l.descripcion).includes(t) || norm(l.codigo).includes(t));
  }, [lineas, q]);

  function sortByDims(a: Line, b: Line): number {
    for (const dim of grupo) {
      const ka = keyOf(a, dim), kb = keyOf(b, dim);
      if (ka !== kb) {
        if (dim === "cantidad") return Number(a.cant) - Number(b.cant);
        if (dim === "precio") return Number(a.imp) - Number(b.imp);
        return ka.localeCompare(kb, "es");
      }
    }
    return 0;
  }

  function buildTree(ls: Line[], depth: number, path: string): Node[] {
    if (depth >= grupo.length) return [];
    const dim = grupo[depth];
    const claves = [...new Set(ls.map(l => keyOf(l, dim)))];
    const esCant = orden === "cantidad";
    const esImp = orden === "precio";
    claves.sort((x, y) => {
      if (orden === "cantidad") {
        const sx = ls.filter(l => keyOf(l, dim) === x).reduce((n, l) => n + signo(l) * l.cant, 0);
        const sy = ls.filter(l => keyOf(l, dim) === y).reduce((n, l) => n + signo(l) * l.cant, 0);
        return (sx - sy) * (dir === "asc" ? 1 : -1);
      }
      if (orden === "precio") {
        const sx = ls.filter(l => keyOf(l, dim) === x).reduce((n, l) => n + signo(l) * l.imp, 0);
        const sy = ls.filter(l => keyOf(l, dim) === y).reduce((n, l) => n + signo(l) * l.imp, 0);
        return (sx - sy) * (dir === "asc" ? 1 : -1);
      }
      const c = x.localeCompare(y, "es");
      return dir === "asc" ? c : -c;
    });
    return claves.map(k => {
      const sub = ls.filter(l => keyOf(l, dim) === k);
      const node: Node = {
        dim, label: k, key: path ? `${path}›${k}` : k, lines: sub, children: [],
        cant: sub.reduce((n, l) => n + signo(l) * l.cant, 0),
        imp: sub.reduce((n, l) => n + signo(l) * l.imp, 0),
      };
      node.children = depth + 1 < grupo.length ? buildTree(sub, depth + 1, node.key) : [];
      return node;
    });
  }

  const arbol = useMemo(() => buildTree(lineasFiltradas, 0, ""), [lineasFiltradas, grupo, orden, dir]);
  const totalCant = lineasFiltradas.reduce((n, l) => n + signo(l) * l.cant, 0);
  const totalImp = lineasFiltradas.reduce((n, l) => n + signo(l) * l.imp, 0);

  const toggle = (k: string) => setColapsados(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function renderLinea(l: Line, i: number, prefijo: string) {
    return <tr key={`${prefijo}-l${i}`} className={l.anulado ? "row-anulada" : ""}>
      {cols.cantidad !== false && <td className="price">{fmtCant(signo(l) * l.cant)}</td>}
      {cols.codigo !== false && <td>{l.codigo}</td>}
      {cols.producto !== false && <td>{l.descripcion}</td>}
      {cols.precio !== false && <td className="price">{dinero(signo(l) * l.imp)}</td>}
      <td><small className="report-sub">{fmtF(l.fecha)} · {l.numero}</small></td>
    </tr>;
  }

  function renderNode(node: Node, depth: number): any[] {
    const cerrado = colapsados.has(node.key);
    const esHoja = node.children.length === 0;
    const filas: any[] = [
      <tr key={node.key} className={esHoja && !detalle ? "group-leaf" : "group-head"} onClick={() => { if (!(esHoja && !detalle)) toggle(node.key); }}>
        <td>{esHoja && !detalle ? null : <button className="group-toggle" onClick={e => { e.stopPropagation(); toggle(node.key); }}>{cerrado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>}</td>
        <td colSpan={colSpanCount()} style={{ paddingLeft: 14 + depth * 18 }}>
          <strong>{DIM_LABEL[node.dim]}: </strong>{node.label}
          {node.dim === "cliente" && node.lines[0]?.clienteDireccion ? <small className="report-direccion"> · Dirección: {node.lines[0].clienteDireccion}</small> : null}
          {!(esHoja && detalle) && <small className="report-sub"> ({node.lines.length} {node.lines.length === 1 ? "línea" : "líneas"})</small>}
        </td>
        <td className="price">{fmtCant(node.cant)}</td>
        <td className="price">{dinero(node.imp)}</td>
      </tr>,
    ];
    if (cerrado) return filas;
    if (esHoja) {
      if (detalle) {
        const ordenadas = [...node.lines].sort((a, b) => (orden === "cantidad" ? signo(b) * b.cant - signo(a) * a.cant : orden === "precio" ? signo(b) * b.imp - signo(a) * a.imp : a.descripcion.localeCompare(b.descripcion, "es")));
        ordenadas.forEach((l, i) => filas.push(renderLinea(l, i, node.key)));
        filas.push(
          <tr key={`${node.key}-sub`} className="group-subtotal">
            <td colSpan={colSpanCount()}><small>Subtotal {node.label}</small></td>
            <td className="price">{fmtCant(node.cant)}</td>
            <td className="price">{dinero(node.imp)}</td>
          </tr>
        );
      }
    } else {
      for (const child of node.children) filas.push(...renderNode(child, depth + 1));
    }
    return filas;
  }

  function colSpanCount(): number {
    let n = 1; // toggle
    if (cols.cantidad !== false) n++;
    if (cols.codigo !== false) n++;
    if (cols.producto !== false) n++;
    if (cols.precio !== false) n++;
    return n;
  }

  function cabecerasDetalle() {
    return <tr>
      <th></th>
      {cols.cantidad !== false && <th>Can.</th>}
      {cols.codigo !== false && <th>Código</th>}
      {cols.producto !== false && <th>Descripción</th>}
      {cols.precio !== false && <th>Precio</th>}
      <th>Detalle</th>
    </tr>;
  }

  function filasExportar(): string[][] {
    const filas: string[][] = [];
    const pushNodo = (node: Node, nivel: number) => {
      const indent = "  ".repeat(nivel) + DIM_LABEL[node.dim] + ": ";
      filas.push([indent + node.label, "", fmtCant(node.cant), dinero(node.imp).replace(/\$/g, "").trim()]);
      if (!colapsados.has(node.key)) {
        if (node.children.length) node.children.forEach(c => pushNodo(c, nivel + 1));
        else if (detalle) node.lines.forEach(l => filas.push(["", `${l.codigo} ${l.descripcion}`, fmtCant(signo(l) * l.cant), (signo(l) * l.imp).toFixed(2)]));
      }
    };
    arbol.forEach(n => pushNodo(n, 0));
    filas.push(["TOTAL ACUMULADO", "", fmtCant(totalCant), totalImp.toFixed(2)]);
    return filas;
  }

  function exportCsv() {
    const head = ["Agrupación", "Concepto", "Cantidad", "Precio"];
    const csv = [head.join(";"), ...filasExportar().map(f => f.map(x => `"${x}"`).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `reporte-ventas-${desde}-${hasta}.csv`;
    a.click();
  }

  function exportExcel() {
    const html = `<html><head><meta charset="utf-8"><title>Reporte de ventas</title></head><body><table border="1"><tr><th>Agrupación</th><th>Concepto</th><th>Cantidad</th><th>Precio</th></tr>${filasExportar().map(f => `<tr>${f.map(x => `<td>${x}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel" }));
    a.download = `reporte-ventas-${desde}-${hasta}.xls`;
    a.click();
  }

  const filtrosVendedores = vendedores;
  function buscarClientes(q: string) {
    api.listClients(q).then((r: any) => setClientes(r.clientes || [])).catch(() => {});
  }
  function buscarProductos(q: string) {
    api.listProducts(q).then((r: any) => setProductos(r.products || [])).catch(() => {});
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div>
        <h3>Reportes de ventas</h3>
        <p>Agrupá por vendedor, cliente o producto · fecha del reporte: {hoy()}</p>
      </div>
      <div className="inline-actions report-toolbar">
        <div className="dropdown-wrap">
          <button onClick={() => setShowExportar(v => !v)}><Download size={16} /> Exportar <ChevronDown size={14} /></button>
          {showExportar && <div className="dropdown-menu">
            <button onClick={() => { exportCsv(); setShowExportar(false); }}>CSV</button>
            <button onClick={() => { exportExcel(); setShowExportar(false); }}>Excel</button>
            <button onClick={() => window.print()}>PDF / imprimir</button>
          </div>}
        </div>
        <button onClick={() => setShowCampos(v => !v)}><SlidersHorizontal size={16} /> Campos</button>
        <button onClick={() => setShowAgrupar(v => !v)}><LayoutGrid size={16} /> Agrupar por</button>
        <button onClick={() => setDetalle(v => !v)}>{detalle ? <><List size={16} /> Resumen</> : <><LayoutGrid size={16} /> Detalle</>}</button>
        <button onClick={() => onNavigate?.("reports")}>Volver</button>
      </div>
    </div>

    {showAgrupar && <div className="modal-backdrop"><div className="modal polished-modal report-config-modal">
      <div className="modal-head"><div><h3>Agrupar por</h3><p>Elegí las dimensiones (en orden). Se pueden combinar: Vendedor → Cliente → Producto.</p></div><button onClick={() => setShowAgrupar(false)}><X /></button></div>
      <div className="form-grid">
        {Object.keys(DIM_LABEL).map(d => <label className="toggle-row" key={d}><div><strong>{DIM_LABEL[d]}</strong><span>{d === "vendedor" ? "Totaliza por vendedor" : d === "cliente" ? "Totaliza por cliente (con dirección)" : "Totaliza por producto y código"}</span></div><input type="checkbox" checked={grupo.includes(d)} onChange={() => toggleDim(d)} /></label>)}
        <div className="full"><p className="report-sub">Orden de agrupación actual: {grupo.length ? grupo.map(d => DIM_LABEL[d]).join(" → ") : "Sin agrupar (detalle plano)"}</p></div>
      </div>
      <div className="modal-actions"><button onClick={() => setShowAgrupar(false)}>Cerrar</button></div>
    </div></div>}

    {showCampos && <div className="modal-backdrop"><div className="modal polished-modal report-config-modal">
      <div className="modal-head"><div><h3>Campos visibles</h3><p>Activá o desactivá columnas. No afecta el agrupamiento.</p></div><button onClick={() => setShowCampos(false)}><X /></button></div>
      <div className="form-grid">
        {[["cantidad", "Cantidad"], ["codigo", "Código"], ["producto", "Producto"], ["precio", "Precio"]].map(([k, label]) => <label className="toggle-row" key={k}><div><strong>{label}</strong></div><input type="checkbox" checked={cols[k] !== false} onChange={() => toggleCol(k)} /></label>)}
      </div>
      <div className="modal-actions"><button onClick={() => setShowCampos(false)}>Cerrar</button></div>
    </div></div>}

    <div className="report-filters">
      <label>Desde<input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
      <label>Hasta<input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
      <label>Estado<select value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos</option><option value="CONFIRMADO">Confirmado</option><option value="BORRADOR">Borrador</option><option value="ANULADO">Anulado</option><option value="AUTORIZADO">Autorizado</option></select></label>
      <label>Vendedor<select value={vendedor?.id || ""} onChange={e => setVendedor(e.target.value ? vendedores.find((v: any) => Number(v.id) === Number(e.target.value)) || null : null)}><option value="">Todos</option>{filtrosVendedores.map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select></label>
      <label>Cliente<select value={cliente?.id || ""} onChange={e => setCliente(e.target.value ? clientes.find((c: any) => Number(c.id) === Number(e.target.value)) || null : null)} onFocus={() => buscarClientes("")}><option value="">Todos</option>{clientes.map((c: any) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}</select></label>
      <label>Producto<select value={producto?.id || ""} onChange={e => setProducto(e.target.value ? productos.find((p: any) => Number(p.id) === Number(e.target.value)) || null : null)} onFocus={() => buscarProductos("")}><option value="">Todos</option>{productos.map((p: any) => <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>)}</select></label>
      <label>Código<input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ej.: CEM25" /></label>
      <div className="tipos-chips">
        <span className="report-sub">Comprobantes:</span>
        {TIPOS_DISPONIBLES.map(t => <button key={t.tipo} className={`chip ${tipos.includes(t.tipo) ? "on" : ""}`} onClick={() => toggleTipo(t.tipo)}>{t.label}</button>)}
      </div>
    </div>

    <div className="report-filters report-sortbar">
      <label>Clasificar por<select value={orden} onChange={e => cambiarOrden(e.target.value)}><option value="vendedor">Vendedor</option><option value="cliente">Cliente</option><option value="producto">Producto</option><option value="cantidad">Cantidad</option><option value="precio">Precio</option></select></label>
      <button onClick={toggleOrder} className="secondary-action"><ArrowUpDown size={15} /> {dir === "asc" ? "Ascendente" : "Descendente"}</button>
      <label className="search-box">Buscar<input value={q} onChange={e => setQ(e.target.value)} placeholder="Vendedor, cliente, producto o código" /><Search size={16} /></label>
    </div>

    {error && <div className="error-box">{error}</div>}

    <div className="products-card expandable-table group-report">
      <table>
        <thead>{detalle ? cabecerasDetalle() : <tr><th></th><th>Agrupación</th><th>Cantidad</th><th>Precio</th></tr>}</thead>
        <tbody>
          {arbol.length ? arbol.map(n => renderNode(n, 0))
            : lineasFiltradas.map((l, i) => <tr key={`flat-${i}`} className={l.anulado ? "row-anulada" : ""}><td></td><td>{l.cliente} · {l.vendedor} · {l.descripcion}</td><td className="price">{fmtCant(signo(l) * l.cant)}</td><td className="price">{dinero(signo(l) * l.imp)}</td></tr>)}
          {lineasFiltradas.length > 0 && <tr className="group-total">
            <td colSpan={detalle ? colSpanCount() : 2}><strong>TOTAL ACUMULADO · {fmtCant(totalCant)} {Math.abs(totalCant) === 1 ? "unidad" : "unidades"} · {lineasFiltradas.length} {lineasFiltradas.length === 1 ? "línea" : "líneas"}</strong></td>
            <td className="price">{fmtCant(totalCant)}</td>
            <td className="price">{dinero(totalImp)}</td>
          </tr>}
        </tbody>
      </table>
      {loading ? <div className="empty-table">Cargando reporte…</div> : !lineasFiltradas.length && <div className="empty-table">No hay ventas para los filtros seleccionados.</div>}
    </div>
  </div>;
}