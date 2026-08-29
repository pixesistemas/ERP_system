import { useState, useEffect } from "react";
import { Sparkles, Wrench, TrendingUp } from "lucide-react";
import { api } from "../../services/api";

const TIPO_META: Record<string, { label: string; cls: string; icon: any }> = {
  NUEVO: { label: "Nuevo", cls: "chg-new", icon: Sparkles },
  CORRECCION: { label: "Corrección", cls: "chg-fix", icon: Wrench },
  MEJORA: { label: "Mejora", cls: "chg-improve", icon: TrendingUp },
};

export function ChangelogPage() {
  const [entradas, setEntradas] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.listChangelog().then((r) => setEntradas(r.entradas || [])).catch((e: any) => setError(e.message));
  }, []);
  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Novedades del sistema</h3><p>Qué tiene de nuevo y qué se corrigió en cada versión del ERP.</p></div>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="changelog-list">
      {entradas.length === 0 && <div className="empty-table">Todavía no hay novedades publicadas.</div>}
      {entradas.map((e) => {
        const meta = TIPO_META[e.tipo] || TIPO_META.MEJORA;
        const Icon = meta.icon;
        return <div className="changelog-item" key={e.id}>
          <div className="changelog-head">
            <span className={`chg-badge ${meta.cls}`}><Icon size={13}/> {meta.label}</span>
            <strong>{e.titulo}</strong>
            <small>v{e.version} · {new Date(e.fecha + (e.fecha.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-AR")}</small>
          </div>
          {e.detalle && <p>{e.detalle}</p>}
        </div>;
      })}
    </div>
  </div>;
}