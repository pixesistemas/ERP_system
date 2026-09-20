import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Printer, RefreshCw, Search } from "lucide-react";
import { erpApi } from "../../services/api";
import { useServerRows } from "../../hooks/useServerStorage";

/*
 * Reportes fijos por vendedor (Etapa 5).
 *
 * No usa el motor dinámico: son vistas fijas (por vendedor, vendedor y
 * cliente, vendedor y producto, por cliente, cliente y producto, por
 * producto y detalle expandible) con filtro de fechas (hoy por defecto)
 * y filtro por vendedor. Exporta a PDF/impresión, Excel y CSV.
 */

type Tipo = "VENDEDOR" | "VENDEDOR_CLIENTE" | "VENDEDOR_PRODUCTO" | "CLIENTE" | "CLIENTE_PRODUCTO" | "PRODUCTO" | "DETALLE";

const TIPOS: { key: Tipo; label: string }[] = [
  { key: "VENDEDOR", label: "Por vendedor" },
  { key: "VENDEDOR_CLIENTE", label: "Vendedor y cliente" },
  { key: "VENDEDOR_PRODUCTO", label: "Vendedor y producto" },
  { key: "CLIENTE", label: "Por cliente" },
  { key: "CLIENTE_PRODUCTO", label: "Cliente y producto" },
  { key: "PRODUCTO", label: "Por producto" },
  { key: "DETALLE", label: "Detalle" },
];

type Fila = { vendedor: string; cliente: string; domicilio: string; localidad: string; codigo: string; descripcion: string; cantidad: number; precio: number; comision: number };
type Salida = { kind: "fila" | "grupo" | "subtotal" | "total"; key: string; numero?: number; cells: string[]; nivel?: number };

const num = (v: any) => Number(v || 0);
const fmtCant = (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 3 });
const fmtMon = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const etiquetaCliente = (f: Fila) => `${f.cliente}${f.domicilio ? ` Direction: ${f.domicilio}` : ""}`;
const suma = (filas: Fila[]) => ({
  cantidad: filas.reduce((n, f) => n + num(f.cantidad), 0),
  precio: filas.reduce((n, f) => n + num(f.precio), 0),
  comision: filas.reduce((n, f) => n + num(f.comision), 0),
});

function agrupar(filas: Fila[], clave: (f: Fila) => string) {
  const mapa = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = clave(f);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(f);
  }
  return mapa;
}

function construir(filas: Fila[], tipo: Tipo, expandidos: Set<string>, todoAbierto = false): { headers: string[]; rows: Salida[] } {
  const rows: Salida[] = [];
  const abierto = (k: string) => todoAbierto || expandidos.has(k);
  const t = suma(filas);

  if (tipo === "VENDEDOR" || tipo === "CLIENTE" || tipo === "PRODUCTO") {
    const clave = tipo === "VENDEDOR" ? (f: Fila) => f.vendedor : tipo === "CLIENTE" ? (f: Fila) => etiquetaCliente(f) : (f: Fila) => f.descripcion;
    let n = 0;
    for (const [k, grupo] of agrupar(filas, clave)) {
      const s = suma(grupo);
      rows.push({ kind: "fila", key: k, numero: ++n, cells: [k, fmtCant(s.cantidad), `$ ${fmtMon(s.precio)}`, `$ ${fmtMon(s.comision)}`] });
    }
    return { headers: [tipo === "VENDEDOR" ? "Vendedor" : tipo === "CLIENTE" ? "Cliente" : "Descripción", "Cantidad (Suma)", "Precio (Suma)", "Comisión (Suma)"], rows };
  }

  if (tipo === "VENDEDOR_CLIENTE" || tipo === "VENDEDOR_PRODUCTO" || tipo === "CLIENTE_PRODUCTO") {
    const porVendedor = tipo !== "CLIENTE_PRODUCTO";
    const externa = porVendedor ? (f: Fila) => f.vendedor : (f: Fila) => etiquetaCliente(f);
    const interna = porVendedor ? (f: Fila) => etiquetaCliente(f) : (f: Fila) => f.descripcion;
    let n = 0;
    for (const [grupo, lista] of agrupar(filas, externa)) {
      if (porVendedor) rows.push({ kind: "grupo", key: `g:${grupo}`, cells: [grupo] });
      for (const [sub, items] of agrupar(lista, interna)) {
        const s = suma(items);
        rows.push({ kind: "fila", key: `${grupo}|${sub}`, numero: ++n, cells: [sub, fmtCant(s.cantidad), `$ ${fmtMon(s.precio)}`, `$ ${fmtMon(s.comision)}`], nivel: porVendedor ? 1 : 0 });
      }
      const sg = suma(lista);
      rows.push({ kind: "subtotal", key: `s:${grupo}`, cells: [`Total ${grupo}`, fmtCant(sg.cantidad), `$ ${fmtMon(sg.precio)}`, `$ ${fmtMon(sg.comision)}`] });
    }
    return { headers: [porVendedor ? "Cliente" : "Descripción", "Cantidad (Suma)", "Precio (Suma)", "Comisión (Suma)"], rows };
  }

  // DETALLE: vendedor -> cliente -> productos, expandible.
  let n = 0;
  for (const [vendedor, porV] of agrupar(filas, (f) => f.vendedor)) {
    const kv = `v:${vendedor}`;
    const sv = suma(porV);
    rows.push({ kind: "grupo", key: kv, cells: [`Vendedor => ${vendedor}`, abierto(kv) ? "" : `${porV.length} líneas`, "", `$ ${fmtMon(sv.precio)}`] });
    if (!abierto(kv)) continue;
    for (const [cliente, porC] of agrupar(porV, (f) => etiquetaCliente(f))) {
      const kc = `c:${vendedor}|${cliente}`;
      const sc = suma(porC);
      rows.push({ kind: "grupo", key: kc, cells: [`Cliente => ${cliente}`, abierto(kc) ? "" : `${porC.length} productos`, "", `$ ${fmtMon(sc.precio)}`], nivel: 1 });
      if (abierto(kc)) {
        for (const f of porC) {
          rows.push({ kind: "fila", key: `${kc}|${f.codigo}|${f.descripcion}`, numero: ++n, cells: [fmtCant(num(f.cantidad)), f.codigo, f.descripcion, `$ ${fmtMon(num(f.precio))}`], nivel: 2 });
        }
      }
      rows.push({ kind: "subtotal", key: `s:${kc}`, cells: [fmtCant(sc.cantidad), "", "Total cliente", `$ ${fmtMon(sc.precio)}`], nivel: 1 });
    }
    rows.push({ kind: "subtotal", key: `sv:${vendedor}`, cells: [fmtCant(sv.cantidad), "", "Total vendedor", `$ ${fmtMon(sv.precio)}`] });
  }
  return { headers: ["Cantidad", "Código", "Descripción", "Precio"], rows, };
}

function filasExportables(rows: Salida[], headers: string[], titulo: string) {
  const matriz: string[][] = [[titulo], headers, ...rows.map((r) => r.cells)];
  return matriz;
}

function imprimir(titulo: string, subtitulo: string, headers: string[], rows: Salida[]) {
  const cuerpo = rows.map((r) => {
    const clase = r.kind === "grupo" ? "grupo" : r.kind === "subtotal" ? "subtotal" : r.kind === "total" ? "total" : "";
    return `<tr class="${clase}">${r.cells.map((c) => `<td>${c || ""}</td>`).join("")}</tr>`;
  }).join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<html><head><title>${titulo}</title><style>
    @page{size:A4 portrait;margin:8mm}
    body{font-family:Arial;font-size:9px;color:#111}
    h1{font-size:14px;margin:0}
    .sub{font-size:10px;color:#444;margin:2px 0 8px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #b9b9c9;padding:2px 5px;text-align:left;line-height:1.25}
    th{background:#2E3A59;color:#fff;font-size:8.5px;text-transform:uppercase}
    td:nth-child(n+2){text-align:right}
    tr.grupo td{background:#EDEFF7;font-weight:700}
    tr.subtotal td{background:#FBF3DC;font-weight:700}
    tr.total td{background:#DCE7F7;font-weight:800}
    thead{display:table-header-group}
  </style></head><body>
    <h1>${titulo}</h1>
    <div class="sub">${subtitulo}</div>
    <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${cuerpo}</tbody></table>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

function descargar(nombre: string, contenido: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contenido], { type: mime }));
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function VendorReportsPage() {
  const [sellers] = useServerRows("afip_sellers_v31", []);
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [tipo, setTipo] = useState<Tipo>("VENDEDOR");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const r = await erpApi.reporteVendedores({ desde, hasta, vendedor_id: vendedorId });
      setFilas(r.filas || []);
      setExpandidos(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return filas;
    return filas.filter((f) => `${f.vendedor} ${f.cliente} ${f.domicilio} ${f.codigo} ${f.descripcion}`.toLowerCase().includes(texto));
  }, [filas, q]);

  const reporte = useMemo(() => construir(filtradas, tipo, expandidos), [filtradas, tipo, expandidos]);
  const completo = useMemo(() => construir(filtradas, tipo, expandidos, true), [filtradas, tipo]);
  const total = useMemo(() => suma(filtradas), [filtradas]);

  const titulo = `REPORTES DE VENTAS ${TIPOS.find((t) => t.key === tipo)?.label.toUpperCase()}`;
  const subtitulo = `Desde ${desde} hasta ${hasta}${vendedorId ? ` · Vendedor: ${sellers.find((s: any) => Number(s.id) === vendedorId)?.nombre || ""}` : ""}`;

  const rowsConTotal = (rows: Salida[]) => [...rows, { kind: "total" as const, key: "total", cells: [`Total Acumulado (${filas.length} líneas)`, fmtCant(total.cantidad), `$ ${fmtMon(total.precio)}`, `$ ${fmtMon(total.comision)}`] }];

  function exportarExcel() {
    const matriz = filasExportables(completo.rows, completo.headers, `${titulo} - ${subtitulo}`);
    const html = `<table border="1">${matriz.map((fila) => `<tr>${fila.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
    descargar(`reporte-vendedores-${desde}-${hasta}.xls`, html, "application/vnd.ms-excel");
  }

  function exportarCsv() {
    const matriz = filasExportables(completo.rows, completo.headers, `${titulo} - ${subtitulo}`);
    const csv = matriz.map((fila) => fila.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    descargar(`reporte-vendedores-${desde}-${hasta}.csv`, "\ufeff" + csv, "text/csv;charset=utf-8");
  }

  function toggle(key: string) {
    const next = new Set(expandidos);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandidos(next);
  }

  const abrirTodo = () => {
    const keys = new Set<string>();
    for (const f of filtradas) {
      keys.add(`v:${f.vendedor}`);
      keys.add(`c:${f.vendedor}|${etiquetaCliente(f)}`);
    }
    setExpandidos(keys);
  };

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Reportes de vendedores</h3><p>Reportes fijos por vendedor, cliente y producto con exportación.</p></div>
      <div className="inline-actions">
        <button className="secondary-action" onClick={cargar} disabled={cargando}><RefreshCw size={16} /> Actualizar</button>
        <button className="secondary-action" onClick={() => imprimir(titulo, subtitulo, completo.headers, rowsConTotal(completo.rows))}><Printer size={16} /> PDF / imprimir</button>
        <button className="secondary-action" onClick={exportarExcel}><Download size={16} /> Excel</button>
        <button className="secondary-action" onClick={exportarCsv}><Download size={16} /> CSV</button>
      </div>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="info-note"><strong>Cómo funciona:</strong> elegí la solapa del reporte (por vendedor, por cliente, por producto o detalle), ajustá el período (viene con el día de hoy) y el vendedor, y tocá <strong>Aplicar</strong>. En Detalle, cada fila se expande (Vendedor → Cliente → Productos). Exportá con <strong>PDF/imprimir</strong>, <strong>Excel</strong> o <strong>CSV</strong>.</div>

    <div className="report-filters">
      <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
      <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      <label>Vendedor<select value={vendedorId || ""} onChange={(e) => setVendedorId(Number(e.target.value) || null)}><option value="">Todos</option>{sellers.filter((s: any) => s.activo !== false).map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
      <label>Búsqueda rápida<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, producto, código..." /></label>
      <button className="primary-action" onClick={cargar} disabled={cargando}><Search size={16} /> Aplicar</button>
    </div>

    <div className="catalog-tabs">
      {TIPOS.map((t) => <button key={t.key} className={tipo === t.key ? "active" : ""} onClick={() => setTipo(t.key)}>{t.label}</button>)}
      {tipo === "DETALLE" && <button onClick={abrirTodo}>Expandir todo</button>}
    </div>

    <div className="products-card reporte-fijo-card">
      <div className="reporte-fijo-head">
        <strong>{titulo}</strong>
        <span>{subtitulo}</span>
      </div>
      <table className="reporte-fijo">
        <thead><tr>{reporte.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {reporte.rows.map((r) => {
            const clase = r.kind === "grupo" ? "grupo" : r.kind === "subtotal" ? "subtotal" : r.kind === "total" ? "total" : "";
            const indent = r.nivel ? { paddingLeft: `${8 + r.nivel * 14}px` } : undefined;
            if (r.kind === "grupo" && (r.key.startsWith("v:") || r.key.startsWith("c:"))) {
              const abierto = expandidos.has(r.key);
              return <tr key={r.key} className="grupo clickeable" onClick={() => toggle(r.key)}>
                <td colSpan={reporte.headers.length}>
                  {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <strong style={indent}>{r.cells[0]}</strong>
                  <span className="muted">{r.cells[1]}</span>
                  <b>{r.cells[3]}</b>
                </td>
              </tr>;
            }
            return <tr key={r.key} className={clase}>
              {r.cells.map((c, i) => <td key={i} style={i === 0 ? indent : undefined}>{r.numero && i === 0 ? `${r.numero}  ${c}` : c}</td>)}
            </tr>;
          })}
          {!reporte.rows.length && <tr><td colSpan={reporte.headers.length} className="empty-table">No hay ventas en el período.</td></tr>}
        </tbody>
      </table>
      <div className="reporte-fijo-total">
        <span>Total Acumulado · {fmtCant(total.cantidad)} unidades</span>
        <strong>$ {fmtMon(total.precio)}</strong>
        <strong>Comisión $ {fmtMon(total.comision)}</strong>
      </div>
    </div>
  </div>;
}
