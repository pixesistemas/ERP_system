import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type DocRow = {
  id?: any;
  fecha?: string;
  fechaEntrega?: string;
  fechaAnulacion?: string;
  numero?: string;
  pv?: number;
  cliente?: string;
  vendedor?: string;
  estado?: string;
  canal?: string;
  total?: number;
  items?: any[];
};

export type Line = {
  fecha: string;
  fechaEntrega: string;
  fechaAnulacion: string;
  numero: string;
  cliente: string;
  vendedor: string;
  estado: string;
  canal: string;
  pv: number;
  codigo: string;
  descripcion: string;
  cant: number;
  imp: number;
  anulado: boolean;
};

export const DIMS: Record<string, { label: string; value: (l: Line) => string }> = {
  PV: { label: "Punto de venta", value: l => `PV ${String(l.pv).padStart(4, "0")}` },
  CLIENTE: { label: "Cliente", value: l => l.cliente },
  VENDEDOR: { label: "Vendedor", value: l => l.vendedor },
  ESTADO: { label: "Estado", value: l => l.estado || "—" },
  CANAL: { label: "Canal", value: l => l.canal || "—" },
  PRODUCTO: { label: "Producto", value: l => `${l.codigo ? l.codigo + " · " : ""}${l.descripcion || ""}` },
};

export function buildLines(rows: DocRow[]): Line[] {
  const out: Line[] = [];
  for (const r of rows) {
    const base: Line = {
      fecha: String(r.fecha || "").slice(0, 10),
      fechaEntrega: String(r.fechaEntrega || "").slice(0, 10),
      fechaAnulacion: String(r.fechaAnulacion || "").slice(0, 10),
      numero: r.numero || "",
      cliente: r.cliente || "CONSUMIDOR FINAL",
      vendedor: r.vendedor || "-",
      estado: r.estado || "",
      canal: r.canal || "WEB",
      pv: Number(r.pv || 1),
      codigo: "",
      descripcion: "",
      cant: 0,
      imp: 0,
      anulado: r.estado === "ANULADO",
    };
    const items = Array.isArray(r.items) && r.items.length ? r.items : null;
    if (items) {
      for (const it of items) {
        out.push({
          ...base,
          codigo: it.codigo || "",
          descripcion: it.descripcion || "",
          cant: Number(it.cantidad || 0),
          imp: Number(it.total != null ? it.total : it.subtotal || 0),
        });
      }
    } else {
      out.push({ ...base, descripcion: r.numero || "", cant: 1, imp: Number(r.total || 0) });
    }
  }
  return out;
}

type Node = { key: string; label: string; lines: Line[]; children: Node[]; cant: number; imp: number };

function build(dims: string[], lines: Line[], depth: number): Node[] {
  if (depth >= dims.length) return [];
  const dimDef = DIMS[dims[depth]];
  const keys = [...new Set(lines.map(l => dimDef.value(l)))].sort((a, b) => a.localeCompare(b, "es"));
  return keys.map(k => {
    const sub = lines.filter(l => dimDef.value(l) === k);
    const node: Node = {
      key: `${dims.slice(0, depth + 1).join("/")}/${k}`,
      label: k,
      lines: sub,
      children: [],
      cant: sub.reduce((n, l) => n + (l.anulado ? -l.cant : l.cant), 0),
      imp: sub.reduce((n, l) => n + (l.anulado ? -l.imp : l.imp), 0),
    };
    node.children = depth + 1 < dims.length ? build(dims, sub, depth + 1) : [];
    return node;
  });
}

const dinero = (v: number) => `${Number(v) < 0 ? "-" : ""}$ ${Math.abs(Number(v)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signo = (l: Line) => (l.anulado ? -1 : 1);
const fmtF = (s: string) => {
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("es-AR");
};

export function DynamicGroupingReport({ rows, levels }: { rows: DocRow[]; levels?: string[] }) {
  const esNiveles = Array.isArray(levels);
  const [sel, setSel] = useState("PV");
  const dims: string[] = esNiveles ? levels : [sel];
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  const lineas = buildLines(rows);
  const grupos = dims.length ? build(dims, lineas, 0) : [];
  const totalCant = lineas.reduce((n, l) => n + signo(l) * l.cant, 0);
  const totalImp = lineas.reduce((n, l) => n + signo(l) * l.imp, 0);

  const toggle = (k: string) => setColapsados(p => {
    const n = new Set(p);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  function renderLinea(l: Line, i: number, prefijo: string) {
    return <tr key={`${prefijo}-l${i}`} className={l.anulado ? "row-anulada" : ""}>
      <td></td>
      <td>{fmtF(l.fecha)}</td>
      {esNiveles && <td>{l.fechaEntrega ? fmtF(l.fechaEntrega) : "—"}</td>}
      {esNiveles && <td>{l.fechaAnulacion ? fmtF(l.fechaAnulacion) : "—"}</td>}
      <td>{l.numero}</td>
      <td>{l.cliente}</td>
      <td>{l.anulado ? <span className="badge danger">ANULADO</span> : (l.estado || "—")}</td>
      <td className="price">{(signo(l) * l.cant).toLocaleString("es-AR")}</td>
      <td className="price">{dinero(signo(l) * l.imp)}</td>
    </tr>;
  }

  function renderNode(node: Node, depth: number, esResumen: boolean): any[] {
    const cerrado = colapsados.has(node.key);
    const esHoja = node.children.length === 0;
    const filas: any[] = [
      <tr key={node.key} className={esHoja && !esResumen ? "group-leaf" : "group-head"}
        onClick={() => { if (!(esHoja && !esResumen)) toggle(node.key); }}>
        <td>{esHoja && !esResumen ? null
          : <button className="group-toggle" onClick={e => { e.stopPropagation(); toggle(node.key); }}>{cerrado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>}</td>
        <td colSpan={4 + (esNiveles ? 2 : 0)} style={{ paddingLeft: 14 + depth * 18 }}>{node.label} {!(esHoja && esResumen) && <small>({node.lines.length} {node.lines.length === 1 ? "línea" : "líneas"})</small>}</td>
        <td className="price">{node.cant.toLocaleString("es-AR")}</td>
        <td className="price">{dinero(node.imp)}</td>
      </tr>,
    ];
    if (cerrado) return filas;
    if (esHoja) {
      if (!esResumen) {
        node.lines.forEach((l, i) => filas.push(renderLinea(l, i, node.key)));
        filas.push(
          <tr key={`${node.key}-sub`} className="group-subtotal">
            <td colSpan={5 + (esNiveles ? 2 : 0)}>Subtotal {node.label}</td>
            <td className="price">{node.cant.toLocaleString("es-AR")}</td>
            <td className="price">{dinero(node.imp)}</td>
          </tr>
        );
      }
    } else {
      for (const child of node.children) filas.push(...renderNode(child, depth + 1, esResumen));
    }
    return filas;
  }

  return <div className="products-card expandable-table group-report">
    <table>
      <thead><tr>
        <th></th><th>Fecha</th>
        {esNiveles && <th>Entrega</th>}
        {esNiveles && <th>Anulación</th>}
        <th>Número</th><th>Cliente</th><th>Estado</th><th>Cantidad</th><th>Importe</th>
      </tr></thead>
      <tbody>
        {!esNiveles && <tr className="group-hint-row"><td colSpan={7}>
          <label className="group-hint">Agrupar por
            <select value={sel} onChange={e => setSel(e.target.value)}>
              <option value="PV">Punto de venta</option>
              <option value="PRODUCTO">Producto</option>
              <option value="CLIENTE">Cliente</option>
              <option value="VENDEDOR">Vendedor</option>
            </select>
          </label>
        </td></tr>}
        {dims.length ? grupos.map(g => renderNode(g, 0, esNiveles)) : lineas.map((l, i) => renderLinea(l, i, "flat"))}
        {lineas.length > 0 && <tr className="group-total">
          <td colSpan={5 + (esNiveles ? 2 : 0)}><strong>TOTAL GENERAL ({lineas.length} {lineas.length === 1 ? "línea" : "líneas"} · {totalCant.toLocaleString("es-AR")} {totalCant === 1 ? "unidad" : "unidades"})</strong></td>
          <td className="price">{totalCant.toLocaleString("es-AR")}</td>
          <td className="price">{dinero(totalImp)}</td>
        </tr>}
      </tbody>
    </table>
    {!lineas.length && <div className="empty-table">No hay documentos para mostrar.</div>}
  </div>;
}
