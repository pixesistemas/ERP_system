import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Package, Phone, RefreshCw, Truck, X } from "lucide-react";
import { erpApi } from "../services/api";
import { fmtFecha } from "../utils/fecha";

/*
 * App del repartidor (PWA): hoja de ruta del día con paradas ordenadas,
 * carga del vehículo, navegación y registro de entregas con hora y GPS.
 */
export function MobileDriverPage() {
  const [ruta, setRuta] = useState<any>(null);
  const [ultimaCerrada, setUltimaCerrada] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [verCarga, setVerCarga] = useState(false);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [entrega, setEntrega] = useState<any>(null);
  const [estadoEntrega, setEstadoEntrega] = useState("ENTREGADO");
  const [obsEntrega, setObsEntrega] = useState("");
  const [devueltos, setDevueltos] = useState<Record<string, number>>({});

  const claveItem = (item: any) => String(item.producto_id ?? item.codigo ?? item.descripcion);

  function abrirEntrega(p: any) {
    setEstadoEntrega("ENTREGADO");
    setObsEntrega("");
    /* Si ya tenía devoluciones cargadas, se muestran para corregir. */
    const previas: Record<string, number> = {};
    for (const dv of p.devoluciones || []) previas[String(dv.producto_id ?? dv.codigo ?? dv.descripcion)] = Number(dv.cantidad || 0);
    setDevueltos(previas);
    setEntrega(p);
  }

  async function cargar() {
    setError("");
    try {
      const r = await erpApi.miRutaReparto();
      setRuta(r.ruta ? r : null);
      setUltimaCerrada(r.ultimaCerrada || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  /*
   * La ruta se actualiza sola cada 20 segundos y al volver a la app:
   * el repartidor ve los cambios sin cerrar y abrir.
   */
  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") cargar();
    }, 20000);
    const alVolver = () => {
      if (document.visibilityState === "visible") cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  function pedirGps(): Promise<{ lat: number | null; lng: number | null }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { timeout: 6000, enableHighAccuracy: true },
      );
    });
  }

  async function confirmarEntrega() {
    if (!ruta || !entrega) return;
    setBusy(true);
    setError("");
    try {
      const g = await pedirGps();
      const devoluciones = (entrega.items || [])
        .map((i: any) => ({
          producto_id: i.producto_id,
          codigo: i.codigo,
          descripcion: i.descripcion,
          cantidad: Number(devueltos[claveItem(i)] || 0),
        }))
        .filter((x: any) => x.cantidad > 0);
      await erpApi.marcarEntregaRuta(ruta.ruta.id, entrega.ruta_pedido_id, {
        estado_entrega: estadoEntrega,
        observaciones: obsEntrega,
        devoluciones,
        latitud: g.lat,
        longitud: g.lng,
      });
      setNotice(`Entrega ${estadoEntrega === "ENTREGADO" ? "registrada" : estadoEntrega === "PARCIAL" ? "registrada como parcial" : "marcada como no entregada"}.`);
      setEntrega(null);
      setObsEntrega("");
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function mapa(p: any) {
    const lat = p.clat ?? p.latitud;
    const lng = p.clng ?? p.longitud;
    if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.domicilio || ""} ${p.localidad || ""}`)}`;
  }

  if (cargando) return <div className="mobile-app"><div className="mobile-cargando">Cargando tu ruta...</div></div>;

  if (!ruta) {
    return <div className="mobile-app">
      <div className="mobile-card">
        <h3>App del repartidor</h3>
        <p>No tenés una ruta activa en este momento.</p>
        {ultimaCerrada ? <p>Tu última ruta está <strong>finalizada</strong> (del {fmtFecha(ultimaCerrada.fecha)}). Pedile a la oficina que la <strong>reabra</strong> o que arme una nueva.</p> : <p>La oficina arma la ruta desde <strong>Ventas → Reparto</strong> y la asigna a <strong>tu usuario</strong>; en cuanto lo haga, aparece acá automáticamente (se actualiza sola cada 20 segundos).</p>}
        <button className="mobile-btn-sec" onClick={cargar}><RefreshCw size={16} /> Actualizar ahora</button>
      </div>
      {error && <div className="error-box">{error}</div>}
    </div>;
  }

  const pendientes = ruta.pedidos.filter((p: any) => p.estado_entrega === "PENDIENTE").length;

  return <div className="mobile-app">
    <div className="mobile-topbar">
      <div className="mobile-hero">
        <h2>Ruta {ruta.ruta.numero}</h2>
        <p>{fmtFecha(ruta.ruta.fecha)} · {ruta.pedidos.length} paradas · {pendientes} pendientes</p>
      </div>
      <button className="mobile-back" onClick={cargar}><RefreshCw size={18} /></button>
    </div>

    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    <button className="mobile-btn-sec full" onClick={() => setVerCarga((v) => !v)}><Package size={18} /> {verCarga ? "Ocultar carga del vehículo" : "Ver carga del vehículo"}</button>

    {verCarga && <div className="mobile-card">
      <h3>Carga del vehículo</h3>
      <p>Total de productos de toda la ruta.</p>
      {ruta.carga.map((c: any) => <div className="mobile-linea" key={`${c.codigo}-${c.descripcion}`}>
        <div><strong>{c.descripcion}</strong><span>{c.codigo}</span></div>
        <b>{Number(c.cantidad).toLocaleString("es-AR")}</b>
      </div>)}
    </div>}

    <div className="mobile-list">
      {ruta.pedidos.map((p: any, i: number) => <div key={p.ruta_pedido_id} className={`mobile-card parada ${p.estado_entrega !== "PENDIENTE" ? "parada-ok" : ""}`}>
        <div className="parada-head">
          <div>
            <h3>{i + 1}. {p.cliente || "CONSUMIDOR FINAL"}</h3>
            <p>{p.domicilio || ""} {p.localidad ? `· ${p.localidad}` : ""}</p>
            <p>Pedido {String(p.punto_venta || "").padStart(4, "0")}-{String(p.numero || "").padStart(8, "0")} · $ {Number(p.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
          </div>
          <span className={p.estado_entrega === "ENTREGADO" ? "badge success" : p.estado_entrega === "NO_ENTREGADO" ? "badge danger" : p.estado_entrega === "PARCIAL" ? "badge warning" : "badge"}>{p.estado_entrega}</span>
        </div>
        <div className="mobile-acciones-cliente">
          <a className="mobile-btn-sec" href={mapa(p)} target="_blank" rel="noreferrer"><MapPin size={16} /> Navegar</a>
          {p.telefono && <a className="mobile-btn-sec" href={`tel:${p.telefono}`}><Phone size={16} /> Llamar</a>}
          <button className="mobile-btn-sec" onClick={() => setExpandido(expandido === p.ruta_pedido_id ? null : p.ruta_pedido_id)}>{expandido === p.ruta_pedido_id ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Productos</button>
        </div>
        {p.devoluciones?.length ? <div className="parada-devueltos">
          {p.devoluciones.map((dv: any) => <div key={dv.id}>−{Number(dv.cantidad).toLocaleString("es-AR")} {dv.descripcion || dv.codigo} {dv.confirmado ? <small>(confirmado)</small> : <small>(pendiente de confirmar)</small>}</div>)}
        </div> : null}
        {expandido === p.ruta_pedido_id && <div className="parada-items">
          {p.items.map((it: any) => <div className="mobile-linea" key={`${it.codigo}-${it.descripcion}`}>
            <div><strong>{it.descripcion}</strong><span>{it.codigo}</span></div>
            <b>{Number(it.cantidad).toLocaleString("es-AR")}</b>
          </div>)}
        </div>}
        {p.estado_entrega === "PENDIENTE" && <button className="mobile-btn-primario" onClick={() => abrirEntrega(p)}><Truck size={18} /> REGISTRAR ENTREGA</button>}
        {p.estado_entrega !== "PENDIENTE" && <button className="mobile-btn-sec full" onClick={() => { abrirEntrega(p); setEstadoEntrega(p.estado_entrega); }}>Cambiar entrega</button>}
      </div>)}
    </div>

    {entrega && <div className="modal-backdrop"><div className="modal mobile-visita">
      <div className="modal-head"><div><h3>{entrega.cliente}</h3><p>Registrar entrega</p></div><button onClick={() => setEntrega(null)}><X /></button></div>
      <div className="mobile-resultados">
        {[{ v: "ENTREGADO", l: "Entregado" }, { v: "PARCIAL", l: "Entrega parcial" }, { v: "NO_ENTREGADO", l: "No entregado" }].map((o) => <label key={o.v} className={estadoEntrega === o.v ? "activo" : ""}>
          <input type="radio" name="entrega" checked={estadoEntrega === o.v} onChange={() => setEstadoEntrega(o.v)} /> {o.l}
        </label>)}
      </div>
      <label className="mobile-obs">Observaciones<input value={obsEntrega} onChange={(e) => setObsEntrega(e.target.value)} placeholder="Opcional" /></label>
      {(entrega.items || []).length > 0 && <div className="mobile-card" style={{ marginTop: 8 }}>
        <h4>¿Te devolvieron algo?</h4>
        <p>Marcá la cantidad que el cliente devolvió. Si no devolvió nada, dejalo en 0. El administrador lo va a ver en la ruta.</p>
        {(entrega.items || []).map((i: any) => <div className="mobile-linea" key={claveItem(i)}>
          <div><strong>{i.descripcion}</strong><span>{i.codigo} · pedido: {Number(i.cantidad).toLocaleString("es-AR")}</span></div>
          <input type="text" inputMode="decimal" pattern="[0-9]*" value={devueltos[claveItem(i)] ?? 0} onFocus={(e) => e.currentTarget.select()} onChange={(e) => { const limpio = String(e.target.value).replace(/[^\d.,]/g, "").replace(",", "."); const n = Number(limpio) || 0; setDevueltos({ ...devueltos, [claveItem(i)]: Math.min(n, Number(i.cantidad)) }); }} style={{ width: 84, height: 38, textAlign: "center", border: "1px solid var(--line-2)", borderRadius: 8, fontWeight: 700 }} />
        </div>)}
      </div>}
      <div className="modal-actions">
        <button onClick={() => setEntrega(null)}>Cancelar</button>
        <button className="primary-action" disabled={busy} onClick={confirmarEntrega}><Truck size={15} /> Guardar entrega</button>
      </div>
    </div></div>}
  </div>;
}
