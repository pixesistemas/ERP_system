import { useState, useEffect } from "react";
import { Phone, Check, X } from "lucide-react";
import { api } from "../../services/api";
import { SearchableClientSelect } from "../shared/SearchableClientSelect";

export function WhatsappOrdersPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [filter, setFilter] = useState<"PENDIENTE" | "APROBADO" | "RECHAZADO" | "">("PENDIENTE");
  const [linking, setLinking] = useState<any>(null);
  const [linkMode, setLinkMode] = useState<"existing" | "new">("existing");
  const [existingClientId, setExistingClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [r, c] = await Promise.all([
        api.listWhatsappOrderRequests(filter || undefined),
        api.listClients(""),
      ]);
      setRequests(r.solicitudes || []);
      setClients(c.clientes || []);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [filter]);

  function openLink(req: any) {
    setLinking(req);
    setLinkMode("existing");
    setExistingClientId("");
    setNewClientName(req.nombre_declarado || "");
  }

  async function confirmApprove() {
    if (!linking) return;
    setError("");
    try {
      if (linkMode === "existing") {
        if (!existingClientId) { setError("Elegí un cliente."); return; }
        await api.approveWhatsappOrderRequest(linking.id, { clienteId: Number(existingClientId) });
      } else {
        if (!newClientName.trim()) { setError("Ingresá el nombre del cliente nuevo."); return; }
        await api.approveWhatsappOrderRequest(linking.id, { clienteNuevo: { razonSocial: newClientName.trim() } });
      }
      setLinking(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function reject(req: any) {
    if (!confirm(`¿Rechazar el número ${req.telefono}? No va a poder pedir por WhatsApp.`)) return;
    setError("");
    try {
      await api.rejectWhatsappOrderRequest(req.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function darDeBaja(req: any) {
    if (!confirm(`¿Dar de baja el número ${req.telefono}? El cliente no va a poder pedir por WhatsApp. Lo podés reactivar después.`)) return;
    setError("");
    try {
      await api.rejectWhatsappOrderRequest(req.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function reactivar(req: any) {
    setError("");
    try {
      await api.reactivarWhatsappOrderRequest(req.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Pedidos por WhatsApp</h3><p>Números que escribieron para pedir por WhatsApp y todavía no están vinculados a un cliente.</p></div>
      <select value={filter} onChange={e => setFilter(e.target.value as any)}>
        <option value="PENDIENTE">Pendientes</option>
        <option value="APROBADO">Aprobados</option>
        <option value="RECHAZADO">Rechazados</option>
        <option value="">Todos</option>
      </select>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="products-card">
      <table>
        <thead><tr><th>Teléfono</th><th>Nombre que dio</th><th>Fecha</th><th>Estado</th><th>Cliente vinculado</th><th></th></tr></thead>
        <tbody>{requests.map((r: any) => <tr key={r.id}>
          <td><Phone size={14} /> <strong>{r.telefono}</strong></td>
          <td>{r.nombre_declarado || "-"}</td>
          <td>{new Date(r.created_at).toLocaleString("es-AR")}</td>
          <td>{r.estado}</td>
          <td>{r.cliente_nombre || "-"}</td>
          <td className="row-actions">{r.estado === "PENDIENTE" && <>
            <button onClick={() => openLink(r)} title="Aprobar y vincular a un cliente"><Check size={16} /></button>
            <button onClick={() => reject(r)} title="Rechazar"><X size={16} /></button>
          </>}{r.estado === "APROBADO" && <button onClick={() => darDeBaja(r)}>Dar de baja</button>}{r.estado === "RECHAZADO" && <button onClick={() => reactivar(r)}>Reactivar</button>}</td>
        </tr>)}</tbody>
      </table>
      {!requests.length && <div className="empty-table">No hay solicitudes para mostrar.</div>}
    </div>

    {linking && <div className="modal-backdrop"><div className="product-modal polished-modal">
      <div className="modal-head"><h3>Aprobar {linking.telefono}</h3><button type="button" onClick={() => setLinking(null)}><X /></button></div>
      <div className="form-grid">
        <div className="sale-mode-toggles">
          <label><input type="radio" checked={linkMode === "existing"} onChange={() => setLinkMode("existing")} /> Vincular a un cliente que ya existe</label>
          <label><input type="radio" checked={linkMode === "new"} onChange={() => setLinkMode("new")} /> Crear cliente nuevo</label>
        </div>
        {linkMode === "existing"
          ? <label className="full">Cliente<SearchableClientSelect clients={clients} value={existingClientId} onChange={setExistingClientId} /></label>
          : <label className="full">Nombre del cliente nuevo<input value={newClientName} onChange={e => setNewClientName(e.target.value)} /></label>}
      </div>
      <div className="modal-actions"><button type="button" onClick={() => setLinking(null)}>Cancelar</button><button className="save" onClick={confirmApprove}>Aprobar y habilitar</button></div>
    </div></div>}
  </div>;
}
