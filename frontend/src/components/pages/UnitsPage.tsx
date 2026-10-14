import { useState } from "react";
import { Check, Plus, Pencil, Trash2, Star, X } from "lucide-react";
import { useServerRows } from "../../hooks/useServerStorage";

/*
 * Unidades de medida. Se puede marcar UNA como predeterminada: esa unidad
 * viene preseleccionada al crear un producto nuevo.
 */
export function UnitsPage() {
  const [rows, save] = useServerRows("afip_units_v34", [
    { id: 1, codigo: "UN", nombre: "Unidad", decimales: 0, predeterminado: true },
    { id: 2, codigo: "KG", nombre: "Kilogramo", decimales: 3 },
    { id: 3, codigo: "M3", nombre: "Metro cúbico", decimales: 3 },
  ]);
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState("");

  function submit(e: any) {
    e.preventDefault();
    setError("");
    const codigo = String(editing?.codigo || "").trim().toUpperCase();
    const nombre = String(editing?.nombre || "").trim();
    if (!codigo || !nombre) return;
    const repetido = rows.some((x: any) =>
      x.id !== editing.id &&
      (String(x.codigo || "").trim().toUpperCase() === codigo || String(x.nombre || "").trim().toLowerCase() === nombre.toLowerCase()));
    if (repetido) {
      return setError(`Ya existe una unidad con ese código o nombre ("${codigo} · ${nombre}").`);
    }
    const yaExiste = rows.some((x: any) => x.id === editing.id);
    save(yaExiste ? rows.map((x: any) => (x.id === editing.id ? { ...editing, codigo, nombre } : x)) : [{ ...editing, codigo, nombre, id: Date.now() }, ...rows]);
    setEditing(null);
  }

  function marcarPredeterminada(id: any) {
    save(rows.map((x: any) => ({ ...x, predeterminado: x.id === id })));
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Unidades de medida</h3><p>Unidades disponibles para productos y comprobantes. La unidad predeterminada viene preseleccionada al crear un producto.</p></div>
      <button className="primary-action" onClick={() => { setError(""); setEditing({ codigo: "", nombre: "", decimales: 0 }) }}><Plus /> Nueva unidad</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="products-card">
      <table>
        <thead><tr><th>Código</th><th>Descripción</th><th>Decimales</th><th>Predeterminada</th><th></th></tr></thead>
        <tbody>{rows.map((r: any) => <tr key={r.id}>
          <td><strong>{r.codigo}</strong></td>
          <td>{r.nombre}</td>
          <td>{r.decimales}</td>
          <td>{r.predeterminado ? <span className="badge success"><Check size={13} /> Sí</span> : <button className="link-button" onClick={() => marcarPredeterminada(r.id)}><Star size={14} /> Usar por defecto</button>}</td>
          <td><button onClick={() => { setError(""); setEditing(r) }}><Pencil size={16} /></button> <button onClick={() => save(rows.filter((x: any) => x.id !== r.id))}><Trash2 size={16} /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    {editing && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={submit}>
      <div className="modal-head"><h3>Unidad de medida</h3><button type="button" onClick={() => setEditing(null)}><X /></button></div>
      <div className="form-grid">
        <label>Código<input required value={editing.codigo} onChange={(e) => setEditing({ ...editing, codigo: e.target.value.toUpperCase() })} /></label>
        <label>Nombre<input required value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} /></label>
        <label>Decimales<input type="number" min="0" max="6" value={editing.decimales} onChange={(e) => setEditing({ ...editing, decimales: Number(e.target.value) })} /></label>
      </div>
      <div className="modal-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="save">Guardar</button></div>
    </form></div>}
  </div>;
}
