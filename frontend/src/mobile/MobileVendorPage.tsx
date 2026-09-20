import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  CloudOff,
  MapPin,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Send,
  ShoppingCart,
  UserRound,
  ClipboardList,
  Route,
  Home,
  X,
} from "lucide-react";
import { erpApi } from "../services/api";
import { guardar, guardarMuchos, listar, obtener, uuidMovil } from "./offlineDb";

/*
 * App móvil del vendedor (PWA).
 *
 * Funciona sin conexión: la cartera, los productos y los pedidos se
 * guardan en IndexedDB. Los pedidos y visitas creados offline quedan en
 * una cola con UUID y se sincronizan cuando vuelve Internet (el servidor
 * no los duplica).
 */

type Vista = "home" | "clientes" | "cliente" | "pedido" | "pedidos" | "ruta";

const RESULTADOS_VISITA = [
  { valor: "PEDIDO", label: "Pedido realizado" },
  { valor: "NO_COMPRO", label: "No compró" },
  { valor: "CERRADO", label: "Local cerrado" },
  { valor: "NO_ESTABA", label: "No estaba" },
  { valor: "REPROGRAMAR", label: "Reprogramar" },
];

function precioNeto(item: any) {
  return Number(item.precio || 0) * Number(item.cantidad || 0) * (1 - Number(item.descuento || 0) / 100);
}

function totalCarrito(carrito: any[]) {
  return carrito.reduce((n, i) => n + precioNeto(i) * (1 + Number(i.iva || 0) / 100), 0);
}

export function MobileVendorPage() {
  const [online, setOnline] = useState(navigator.onLine);
  const [vendedor, setVendedor] = useState<any>(null);
  const [clientes, setClientes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [pedidosServer, setPedidosServer] = useState<any[]>([]);
  const [cola, setCola] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [vista, setVista] = useState<Vista>("home");
  const [clienteSel, setClienteSel] = useState<any>(null);
  const [q, setQ] = useState("");
  const [qProd, setQProd] = useState("");
  const [carrito, setCarrito] = useState<any[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [visitaOpen, setVisitaOpen] = useState(false);
  const [visitaResultado, setVisitaResultado] = useState("NO_COMPRO");
  const [visitaObs, setVisitaObs] = useState("");
  const [geoPendiente, setGeoPendiente] = useState(false);

  async function refrescarCola() {
    const pedidos = await listar("pedidos");
    const visitas = await listar("visitas");
    setCola([...pedidos, ...visitas].filter((x: any) => x.pendiente));
  }

  useEffect(() => {
    (async () => {
      try {
        const cacheMeta: any = await obtener("meta", "bootstrap");
        const cacheClientes: any = await listar("clientes");
        const cacheProductos: any = await listar("productos");
        if (cacheMeta?.valor) {
          setVendedor(cacheMeta.valor.vendedor || null);
          setPedidosServer(cacheMeta.valor.pedidos || []);
          setClientes(cacheClientes.length ? cacheClientes : cacheMeta.valor.clientes || []);
          setProductos(cacheProductos.length ? cacheProductos : cacheMeta.valor.productos || []);
        }
        const r = await erpApi.movilBootstrap();
        setVendedor(r.vendedor || null);
        setClientes(r.clientes || []);
        setProductos(r.productos || []);
        setPedidosServer(r.pedidos || []);
        await guardar("meta", { id: "bootstrap", valor: r, actualizado: new Date().toISOString() });
        await guardarMuchos("clientes", (r.clientes || []).map((c: any) => ({ ...c, id: Number(c.id) })));
        await guardarMuchos("productos", (r.productos || []).map((p: any) => ({ ...p, id: Number(p.id) })));
        setError("");
      } catch (e: any) {
        if (!vendedor && !clientes.length) setError(e.message);
      } finally {
        setCargando(false);
        refrescarCola();
      }
    })();
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (online && !cargando) sincronizar();
  }, [online, cargando]);

  async function sincronizar() {
    if (sincronizando) return;
    const pedidos = (await listar("pedidos")).filter((x: any) => x.pendiente);
    const visitas = (await listar("visitas")).filter((x: any) => x.pendiente);
    const pendientes = [...pedidos, ...visitas];
    if (!pendientes.length) return;
    setSincronizando(true);
    setNotice(`Sincronizando ${pendientes.length} registro(s)...`);
    for (const item of pendientes) {
      try {
        if (item.tipo === "PEDIDO") await erpApi.createMobileOrder(item.payload);
        else await erpApi.createVisita(item.payload);
        item.pendiente = false;
        item.sincronizadoEn = new Date().toISOString();
        await guardar(item.tipo === "PEDIDO" ? "pedidos" : "visitas", item);
      } catch (e: any) {
        item.error = e.message;
        await guardar(item.tipo === "PEDIDO" ? "pedidos" : "visitas", item);
      }
    }
    await refrescarCola();
    setSincronizando(false);
    const restantes = (await listar("pedidos")).filter((x: any) => x.pendiente).length + (await listar("visitas")).filter((x: any) => x.pendiente).length;
    setNotice(restantes ? `Quedaron ${restantes} pendientes de sincronizar.` : "✓ Todo sincronizado.");
    if (online) {
      try {
        const r = await erpApi.listMobileOrders();
        setPedidosServer(r.pedidos || []);
      } catch {}
    }
  }

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

  const clientesFiltrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return clientes;
    return clientes.filter((c: any) =>
      `${c.razon_social} ${c.cuit || ""} ${c.dni || ""} ${c.telefono || ""} ${c.domicilio || ""} ${c.localidad || ""}`
        .toLowerCase()
        .includes(texto),
    );
  }, [q, clientes]);

  const productosFiltrados = useMemo(() => {
    const texto = qProd.trim().toLowerCase();
    if (texto.length < 2) return [];
    return productos
      .filter((p: any) => {
        const codigos = `${p.codigo || ""} ${p.codigoBarra || ""} ${(p.codigosBarras || []).map((x: any) => x.codigoBarra).join(" ")}`;
        return `${codigos} ${p.descripcion || ""}`.toLowerCase().includes(texto);
      })
      .slice(0, 20);
  }, [qProd, productos]);

  function agregarProducto(p: any) {
    setCarrito((actual) => {
      const existe = actual.find((i) => Number(i.id) === Number(p.id));
      if (existe) return actual.map((i) => (Number(i.id) === Number(p.id) ? { ...i, cantidad: Number(i.cantidad) + 1 } : i));
      return [...actual, { ...p, cantidad: 1 }];
    });
    setQProd("");
  }

  function cambiarCantidad(id: number, delta: number) {
    setCarrito((actual) =>
      actual
        .map((i) => (Number(i.id) === id ? { ...i, cantidad: Number(i.cantidad) + delta } : i))
        .filter((i) => Number(i.cantidad) > 0),
    );
  }

  async function enviarPedido() {
    if (!clienteSel || !carrito.length) return;
    const uuid = uuidMovil();
    const g = await pedirGps();
    if (g.lat == null) setGeoPendiente(true);
    const payload = {
      uuid,
      cliente_id: Number(clienteSel.id),
      items: carrito.map((i) => ({
        producto_id: Number(i.id),
        codigo: i.codigo,
        descripcion: i.descripcion,
        unidad: i.unidad || "UN",
        cantidad: Number(i.cantidad),
        precio_unitario: Number(i.precio),
        iva: Number(i.iva ?? 21),
      })),
      latitud: g.lat,
      longitud: g.lng,
      observaciones,
      dispositivo: navigator.userAgent.slice(0, 150),
    };
    const local = {
      id: uuid,
      tipo: "PEDIDO",
      pendiente: true,
      creado: new Date().toISOString(),
      cliente: clienteSel.razon_social,
      total: totalCarrito(carrito),
      payload,
    };
    await guardar("pedidos", local);
    await refrescarCola();
    setCarrito([]);
    setObservaciones("");
    if (online) {
      await sincronizar();
      setNotice("Pedido enviado al sistema.");
    } else {
      setNotice("📴 Pedido guardado. Se enviará cuando vuelva Internet.");
    }
    setClienteSel(null);
    setVista("home");
  }

  async function guardarVisita() {
    if (!clienteSel) return;
    const g = await pedirGps();
    const uuid = uuidMovil();
    const payload = {
      uuid,
      cliente_id: Number(clienteSel.id),
      resultado: visitaResultado,
      observaciones: visitaObs,
      latitud: g.lat,
      longitud: g.lng,
      dispositivo: navigator.userAgent.slice(0, 150),
    };
    await guardar("visitas", {
      id: uuid,
      tipo: "VISITA",
      pendiente: true,
      creado: new Date().toISOString(),
      cliente: clienteSel.razon_social,
      payload,
    });
    await refrescarCola();
    setVisitaOpen(false);
    setVisitaObs("");
    if (online) {
      await sincronizar();
      setNotice("Visita registrada.");
    } else {
      setNotice("📴 Visita guardada. Se enviará cuando vuelva Internet.");
    }
  }

  function mapaCliente(c: any) {
    if (c.latitud != null && c.longitud != null) return `https://www.google.com/maps?q=${c.latitud},${c.longitud}`;
    return `https://www.google.com/maps/search/${encodeURIComponent(`${c.domicilio || ""} ${c.localidad || ""}`)}`;
  }

  function ultimoPedido(clienteId: number) {
    return pedidosServer.find((p: any) => Number(p.cliente_id || 0) === Number(clienteId));
  }

  if (cargando) return <div className="mobile-app"><div className="mobile-cargando">Cargando datos...</div></div>;

  if (!vendedor) {
    return <div className="mobile-app">
      <div className="mobile-card">
        <h3>App del vendedor</h3>
        <p>Tu usuario todavía no está vinculado a un vendedor. Pedile al administrador que lo asocie desde <strong>Vendedores</strong>.</p>
        {error && <div className="error-box">{error}</div>}
      </div>
    </div>;
  }

  const rutaPorLocalidad = useMemo(() => {
    const grupos: Record<string, any[]> = {};
    for (const c of clientes) {
      const key = c.localidad || "SIN LOCALIDAD";
      (grupos[key] = grupos[key] || []).push(c);
    }
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
  }, [clientes]);

  return <div className="mobile-app">
    <div className="mobile-topbar">
      <button className="mobile-back" onClick={() => { setVista("home"); setClienteSel(null); }}><Home size={18} /></button>
      <div className="mobile-estado">
        {online ? <span className="mobile-online"><Cloud size={15} /> Online</span> : <span className="mobile-offline"><CloudOff size={15} /> Sin conexión</span>}
        {cola.length > 0 && <button className="mobile-pendientes" onClick={sincronizar} disabled={sincronizando}><RefreshCw size={14} /> {cola.length} pendiente(s)</button>}
      </div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    {geoPendiente && <div className="mobile-aviso">📍 Ubicación pendiente: el pedido se guardó sin GPS y se reintentará al sincronizar.</div>}

    {vista === "home" && <>
      <div className="mobile-hero">
        <h2>Hola {vendedor.nombre}</h2>
        <p>{clientes.length} clientes en tu cartera</p>
      </div>
      <div className="mobile-grid">
        <button className="mobile-action" onClick={() => { setVista("pedidos"); }}><ClipboardList size={22} /><strong>Pedidos de hoy</strong><span>{pedidosServer.length} enviados</span></button>
        <button className="mobile-action" onClick={() => { setVista("clientes"); setQ(""); }}><UserRound size={22} /><strong>Clientes</strong><span>Buscar y tomar pedido</span></button>
        <button className="mobile-action" onClick={() => { setVista("ruta"); }}><Route size={22} /><strong>Ruta</strong><span>Por localidad</span></button>
        <button className="mobile-action" onClick={() => { setVista("clientes"); setQ(""); setNotice("Elegí el cliente para registrar la visita."); }}><MapPin size={22} /><strong>Visitas</strong><span>Registrar recorrido</span></button>
      </div>
    </>}

    {vista === "clientes" && <>
      <div className="mobile-search">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, CUIT, dirección..." />
      </div>
      <div className="mobile-list">
        {clientesFiltrados.slice(0, 80).map((c: any) => <button key={c.id} className="mobile-cliente" onClick={() => { setClienteSel(c); setVista("cliente"); }}>
          <div><strong>{c.razon_social}</strong><span>{c.domicilio || c.localidad || ""}</span></div>
          <small>{ultimoPedido(c.id)?.fecha ? `Último pedido: ${String(ultimoPedido(c.id).fecha).slice(0, 10)}` : "Sin pedidos"}</small>
        </button>)}
        {!clientesFiltrados.length && <div className="empty-table">No hay clientes que coincidan.</div>}
      </div>
    </>}

    {vista === "cliente" && clienteSel && <>
      <div className="mobile-card">
        <h3>{clienteSel.razon_social}</h3>
        <p>{clienteSel.domicilio || ""} {clienteSel.localidad ? `· ${clienteSel.localidad}` : ""}</p>
        <p>{clienteSel.cuit ? `CUIT ${clienteSel.cuit}` : clienteSel.dni ? `DNI ${clienteSel.dni}` : ""}</p>
        <div className="mobile-acciones-cliente">
          {clienteSel.telefono && <a className="mobile-btn-sec" href={`tel:${clienteSel.telefono}`}><Phone size={16} /> Llamar</a>}
          <a className="mobile-btn-sec" href={mapaCliente(clienteSel)} target="_blank" rel="noreferrer"><MapPin size={16} /> Mapa</a>
        </div>
      </div>
      <button className="mobile-btn-primario" onClick={() => { setCarrito([]); setObservaciones(""); setQProd(""); setVista("pedido"); }}><ShoppingCart size={18} /> NUEVO PEDIDO</button>
      <button className="mobile-btn-sec full" onClick={() => { setVisitaResultado("NO_COMPRO"); setVisitaOpen(true); }}><MapPin size={18} /> REGISTRAR VISITA</button>
    </>}

    {vista === "pedido" && clienteSel && <>
      <div className="mobile-search">
        <input autoFocus value={qProd} onChange={(e) => setQProd(e.target.value)} placeholder="Buscar producto por código o descripción..." />
      </div>
      {productosFiltrados.length > 0 && <div className="mobile-list">
        {productosFiltrados.map((p: any) => <button key={p.id} className="mobile-producto" onClick={() => agregarProducto(p)}>
          <div><strong>{p.descripcion}</strong><span>{p.codigo} · $ {Number(p.precio).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span></div>
          <Plus size={18} />
        </button>)}
      </div>}
      {qProd.length >= 2 && !productosFiltrados.length && <div className="empty-table">Sin resultados para "{qProd}".</div>}

      <div className="mobile-carrito">
        <h4>Pedido para {clienteSel.razon_social}</h4>
        {!carrito.length && <p className="mobile-vacio">Buscá productos y tocálos para agregarlos.</p>}
        {carrito.map((i: any) => <div className="mobile-linea" key={i.id}>
          <div><strong>{i.descripcion}</strong><span>$ {Number(i.precio).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span></div>
          <div className="mobile-cantidad">
            <button onClick={() => cambiarCantidad(Number(i.id), -1)}><Minus size={15} /></button>
            <b>{i.cantidad}</b>
            <button onClick={() => cambiarCantidad(Number(i.id), 1)}><Plus size={15} /></button>
          </div>
        </div>)}
        {carrito.length > 0 && <>
          <label className="mobile-obs">Observaciones<input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Opcional" /></label>
          <div className="mobile-total"><span>TOTAL PRODUCTOS</span><strong>{carrito.reduce((n, i) => n + Number(i.cantidad), 0)}</strong></div>
          <div className="mobile-total"><span>TOTAL</span><strong>$ {totalCarrito(carrito).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>
          <button className="mobile-btn-primario" onClick={enviarPedido}><Send size={18} /> ENVIAR PEDIDO</button>
        </>}
      </div>
    </>}

    {vista === "pedidos" && <>
      <div className="mobile-card">
        <h3>Mis pedidos</h3>
        <p>{cola.length ? `${cola.length} pendiente(s) de sincronizar` : "Todo sincronizado"}</p>
      </div>
      <div className="mobile-list">
        {cola.map((p: any) => <div key={p.id} className="mobile-cliente pendiente">
          <div><strong>{p.cliente}</strong><span>{p.tipo === "PEDIDO" ? "Pedido" : "Visita"} · {new Date(p.creado).toLocaleString("es-AR")}</span></div>
          <small className="badge warning">PENDIENTE</small>
        </div>)}
        {pedidosServer.map((p: any) => <div key={p.id} className="mobile-cliente">
          <div><strong>{p.cliente || "CONSUMIDOR FINAL"}</strong><span>{p.tipo} {String(p.punto_venta || "").padStart(4, "0")}-{String(p.numero || "").padStart(8, "0")} · {String(p.fecha || "").slice(0, 10)}</span></div>
          <small className="badge">{p.estado || "PENDIENTE"}</small>
        </div>)}
        {!cola.length && !pedidosServer.length && <div className="empty-table">Todavía no enviaste pedidos.</div>}
      </div>
    </>}

    {vista === "ruta" && <>
      <div className="mobile-card">
        <h3>Ruta por localidad</h3>
        <p>Tu cartera ordenada por zona para recorrer el día.</p>
      </div>
      {rutaPorLocalidad.map(([localidad, lista]) => <div className="mobile-card" key={localidad}>
        <h4>{localidad} ({lista.length})</h4>
        {lista.map((c: any) => <button key={c.id} className="mobile-cliente" onClick={() => { setClienteSel(c); setVista("cliente"); }}>
          <div><strong>{c.razon_social}</strong><span>{c.domicilio || ""}</span></div>
          <MapPin size={16} />
        </button>)}
      </div>)}
      {!clientes.length && <div className="empty-table">No tenés clientes asignados todavía.</div>}
    </>}

    {visitaOpen && <div className="modal-backdrop"><div className="modal mobile-visita">
      <div className="modal-head"><div><h3>Visita a {clienteSel?.razon_social}</h3><p>Resultado de la visita</p></div><button onClick={() => setVisitaOpen(false)}><X /></button></div>
      <div className="mobile-resultados">
        {RESULTADOS_VISITA.map((r) => <label key={r.valor} className={visitaResultado === r.valor ? "activo" : ""}>
          <input type="radio" name="resultado" checked={visitaResultado === r.valor} onChange={() => setVisitaResultado(r.valor)} /> {r.label}
        </label>)}
      </div>
      <label className="mobile-obs">Observaciones<input value={visitaObs} onChange={(e) => setVisitaObs(e.target.value)} placeholder="Opcional" /></label>
      <div className="modal-actions">
        <button onClick={() => setVisitaOpen(false)}>Cancelar</button>
        <button className="primary-action" onClick={guardarVisita}><Send size={15} /> Guardar visita</button>
      </div>
    </div></div>}
  </div>;
}
