import { useState, useEffect } from "react";
import { Plus, X, UserRound, MonitorSmartphone } from "lucide-react";
import { api, erpApi } from "../../services/api";

export function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [creating, setCreating] = useState<any>(null);
  const [error, setError] = useState("");
  const [pvUser, setPvUser] = useState<any>(null);
  const [pointsOfSale, setPointsOfSale] = useState<any[]>([]);
  const [asignados, setAsignados] = useState<Set<number>>(new Set());
  const [predeterminado, setPredeterminado] = useState<number | null>(null);

  async function load() {
    setError("");
    try {
      const [u, r] = await Promise.all([api.listUsers(), api.listRoles()]);
      setUsers(u.usuarios || []);
      setRoles(r.roles || []);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function openPvModal(u: any) {
    setError("");
    try {
      const [puntos, asign] = await Promise.all([
        erpApi.listPointsOfSale(),
        api.listUserPointsOfSale(u.id),
      ]);
      setPointsOfSale(puntos.puntosVenta || []);
      setAsignados(new Set((asign.puntosVenta || []).map((p: any) => Number(p.punto_venta_id))));
      const def = (asign.puntosVenta || []).find((p: any) => p.predeterminado);
      setPredeterminado(def ? Number(def.punto_venta_id) : null);
      setPvUser(u);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function savePv() {
    if (!pvUser) return;
    setError("");
    try {
      await api.saveUserPointsOfSale(pvUser.id, {
        asignados: Array.from(asignados),
        predeterminado,
      });
      setPvUser(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function submit(e: any) {
    e.preventDefault();
    setError("");
    try {
      await api.createUser(creating);
      setCreating(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggleActive(u: any) {
    setError("");
    try {
      await api.setUserActive(u.id, !u.activo);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function changeRole(u: any, rol: string) {
    setError("");
    try {
      await api.changeUserRole(u.id, rol);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Usuarios</h3><p>Quién puede entrar al sistema y con qué rol.</p></div>
      <button className="primary-action" onClick={() => setCreating({ nombre: "", email: "", telefono: "", password: "", rol: roles[0]?.nombre || "ADMIN" })}><Plus /> Nuevo usuario</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="products-card">
      <table>
        <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Rol</th><th>Estado</th><th></th><th></th></tr></thead>
        <tbody>{users.map((u: any) => <tr key={u.id}>
          <td><strong>{u.nombre}</strong></td>
          <td>{u.email}</td>
          <td>{u.telefono || "-"}</td>
          <td><select value={u.rol || ""} onChange={e => changeRole(u, e.target.value)}>{!u.rol && <option value="">Sin rol</option>}{roles.map((r: any) => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}</select></td>
          <td>{u.activo ? "ACTIVO" : "INACTIVO"}</td>
          <td><button onClick={() => toggleActive(u)}>{u.activo ? "Desactivar" : "Activar"}</button></td>
          <td><button className="secondary-action" onClick={() => openPvModal(u)}><MonitorSmartphone /> Puntos de venta</button></td>
        </tr>)}</tbody>
      </table>
      {!users.length && <div className="empty-table">No hay usuarios cargados.</div>}
    </div>
    {creating && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={submit}>
      <div className="modal-head"><div><UserRound /><h3>Nuevo usuario</h3></div><button type="button" onClick={() => setCreating(null)}><X /></button></div>
      <div className="form-grid">
        <label>Nombre<input required value={creating.nombre} onChange={e => setCreating({ ...creating, nombre: e.target.value })} /></label>
        <label>Email<input required type="email" value={creating.email} onChange={e => setCreating({ ...creating, email: e.target.value })} /></label>
        <label>Teléfono<input value={creating.telefono} onChange={e => setCreating({ ...creating, telefono: e.target.value })} /></label>
        <label>Contraseña<input required type="password" value={creating.password} onChange={e => setCreating({ ...creating, password: e.target.value })} /></label>
        <label>Rol<select value={creating.rol} onChange={e => setCreating({ ...creating, rol: e.target.value })}>{roles.map((r: any) => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}</select></label>
      </div>
      <div className="modal-actions"><button type="button" onClick={() => setCreating(null)}>Cancelar</button><button className="save">Crear usuario</button></div>
    </form></div>}
    {pvUser && <div className="modal-backdrop"><div className="product-modal polished-modal">
      <div className="modal-head"><div><MonitorSmartphone /><h3>Puntos de venta de {pvUser.nombre}</h3></div><button type="button" onClick={() => setPvUser(null)}><X /></button></div>
      <p className="form-hint">El operador solo podrá facturar en los puntos de venta marcados. Elegí uno como predeterminado.</p>
      <div className="pv-list">
        {pointsOfSale.map((pv: any) => {
          const id = Number(pv.id);
          const checked = asignados.has(id);
          return <label key={id} className="pv-row">
            <input type="checkbox" checked={checked} onChange={e => {
              const next = new Set(asignados);
              if (e.target.checked) { next.add(id); } else { next.delete(id); if (predeterminado === id) setPredeterminado(null); }
              setAsignados(next);
            }} />
            <span><b>PV {pv.numero}</b> — {pv.nombre || "Sin nombre"}</span>
            <input type="radio" name="pv-predeterminado" title="Predeterminado" checked={predeterminado === id} disabled={!checked} onChange={() => setPredeterminado(id)} />
            <small>Predeterminado</small>
          </label>;
        })}
        {!pointsOfSale.length && <div className="empty-table">No hay puntos de venta activos.</div>}
      </div>
      <div className="modal-actions"><button type="button" onClick={() => setPvUser(null)}>Cancelar</button><button className="save" onClick={savePv}>Guardar asignación</button></div>
    </div></div>}
  </div>;
}
