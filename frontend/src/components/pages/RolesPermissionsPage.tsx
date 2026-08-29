import { useState, useEffect } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { SCREEN_SECTIONS } from "../../utils/screens";

export function RolesPermissionsPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newRoleName, setNewRoleName] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    setError("");
    try {
      const r = await api.listRoles();
      setRoles(r.roles || []);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  function select(rol: any) {
    setSelected(rol);
    setChecked(new Set(rol.pantallas || []));
    setStatus("");
  }

  async function createRole(e: any) {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setError("");
    try {
      await api.createRole({ nombre: newRoleName.trim() });
      setNewRoleName("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeRole(rol: any) {
    if (!confirm(`¿Eliminar el rol ${rol.nombre}? Solo se puede si no tiene usuarios asignados.`)) return;
    setError("");
    try {
      await api.deleteRole(rol.id);
      if (selected?.id === rol.id) setSelected(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function toggle(key: string) {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key); else next.add(key);
    setChecked(next);
  }

  function toggleSection(keys: string[], allOn: boolean) {
    const next = new Set(checked);
    for (const k of keys) { if (allOn) next.delete(k); else next.add(k); }
    setChecked(next);
  }

  async function savePermissions() {
    if (!selected) return;
    setError(""); setStatus("");
    try {
      await api.saveRoleScreens(selected.id, Array.from(checked));
      setStatus("Guardado.");
      await load();
      setTimeout(() => setStatus(""), 2500);
    } catch (e: any) {
      setError(e.message);
    }
  }

  const allScreensSelected = checked.size === 0;

  return <div className="roles-page">
    {error && <div className="error-box">{error}</div>}
    <div className="roles-layout">
      <section className="roles-list-card">
        <h3><ShieldCheck size={18} /> Roles</h3>
        <form onSubmit={createRole} className="new-role-form">
          <input placeholder="Nombre del rol nuevo" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} />
          <button type="submit"><Plus size={16} /></button>
        </form>
        <div className="role-list">{roles.map((r: any) => <button key={r.id} className={selected?.id === r.id ? "active" : ""} onClick={() => select(r)}>
          <span><strong>{r.nombre}</strong><small>{r.pantallas?.length ? `${r.pantallas.length} pantallas habilitadas` : "Ve todas las pantallas"}</small></span>
          <Trash2 size={15} onClick={(e) => { e.stopPropagation(); removeRole(r); }} />
        </button>)}</div>
        {!roles.length && <p className="empty-table">Todavía no hay roles creados.</p>}
      </section>

      {selected ? <section className="roles-permissions-card">
        <div className="roles-permissions-head">
          <div><h3>Pantallas para {selected.nombre}</h3><p>Si no marcás ninguna, el rol ve todas las pantallas (comportamiento por defecto).</p></div>
          <button className="primary-action" onClick={savePermissions}>Guardar</button>
        </div>
        {status && <div className="success-box">{status}</div>}
        {allScreensSelected && <div className="info-note">Este rol ve todas las pantallas porque no hay ninguna marcada.</div>}
        {SCREEN_SECTIONS.map(section => {
          const keys = section.screens.map(s => s.key);
          const allOn = keys.every(k => checked.has(k));
          return <div className="permission-section" key={section.section}>
            <div className="permission-section-head">
              <strong>{section.section}</strong>
              <button type="button" onClick={() => toggleSection(keys, allOn)}>{allOn ? "Ninguna" : "Todas"}</button>
            </div>
            <div className="permission-grid">{section.screens.map(s => <label key={s.key}>
              <input type="checkbox" checked={checked.has(s.key)} onChange={() => toggle(s.key)} />
              {s.label}
            </label>)}</div>
          </div>;
        })}
      </section> : <section className="roles-permissions-card empty-state">
        <p>Elegí un rol de la izquierda para configurar qué pantallas puede ver.</p>
      </section>}
    </div>
  </div>;
}
