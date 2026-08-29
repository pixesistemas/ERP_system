import { useState } from "react";
import { ChevronRight, Search, Check } from "lucide-react";
import { Client } from "../../types";

export function SearchableClientSelect({ clients, value, onChange }: { clients: Client[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = clients.find(c => String(c.id) === String(value));
  const rows = clients
    .filter(c => `${c.razonSocial} ${c.cuit || ""} ${c.dni || ""} ${c.telefono || ""}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 80);

  return <div className={`searchable-select${open ? " open" : ""}`}>
    <button type="button" className="searchable-trigger" onClick={() => setOpen(!open)}>
      <span className={selected ? "" : "searchable-placeholder"}>{selected ? `${selected.razonSocial} · ${selected.cuit || selected.dni || "Sin documento"}` : "Buscar cliente por nombre, CUIT, DNI o teléfono..."}</span>
      {selected && <Check size={15} className="searchable-check" />}
      <ChevronRight size={16} className="searchable-chevron" />
    </button>
    {open && <div className="searchable-panel">
      <div className="searchable-panel-search"><Search size={16} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Escribí para buscar..." /></div>
      <div className="searchable-panel-list">
        {rows.map(c => <button type="button" key={c.id} onClick={() => { onChange(String(c.id)); setOpen(false); setQ(""); }}>
          <strong>{c.razonSocial}</strong>
          <span>{c.cuit || c.dni || "Sin documento"} · {c.telefono || "Sin teléfono"}</span>
        </button>)}
        {!rows.length && <p>No se encontraron clientes.</p>}
      </div>
    </div>}
  </div>;
}
