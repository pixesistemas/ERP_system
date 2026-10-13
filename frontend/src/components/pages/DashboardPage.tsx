import { useState, useEffect } from "react";
import { BadgeDollarSign, Check, ChevronDown, ChevronRight, MessageSquareText, PackageSearch, Receipt, ShoppingCart, Store, Users, Warehouse } from "lucide-react";
import { api, erpApi } from "../../services/api";

/*
 * Resumen con "Primeros pasos": una guía plegable (estilo Tiendanube) que
 * muestra qué falta configurar para dejar el sistema a punto. Cada paso
 * verifica datos reales y lleva a la pantalla correspondiente.
 */
type Paso = { clave: string; titulo: string; corto: string; detalle: string; hecho: boolean; ir: string; boton: string };

export function DashboardPage({ onNavigate, modulos }: { onNavigate: (page: string) => void; modulos?: any }) {
  const [data, setData] = useState<any>({ products: [], clients: [], stock: [], documents: [] });
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [puntos, setPuntos] = useState<any[]>([]);
  const [ajustes, setAjustes] = useState<any>({});
  const [tiendanube, setTiendanube] = useState<any>(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.listProducts(""),
      api.listClients(""),
      api.listStock(),
      api.listDocuments(""),
      api.listUsers().catch(() => ({ usuarios: [] })),
      erpApi.listPointsOfSale().catch(() => ({ puntosVenta: [] })),
      api.getCompanySettings().catch(() => ({ settings: {} })),
      modulos?.TIENDANUBE ? erpApi.getTiendanube().catch(() => null) : Promise.resolve(null),
    ])
      .then(([p, c, s, d, u, pv, st, tn]) => {
        setData({ products: p.products || [], clients: c.clientes || [], stock: s.stock || [], documents: d.documentos || d.documents || [] });
        setUsuarios(u.usuarios || []);
        setPuntos(pv.puntosVenta || pv.pointsOfSale || []);
        setAjustes(st.settings || {});
        setTiendanube(tn);
      })
      .catch((e: any) => setError(e.message));
  }, [modulos]);

  const alerts = (data.stock || []).filter((r: any) => Boolean(r.alerta_stock) || Number(r.disponible ?? r.cantidad ?? 0) <= Number(r.stock_minimo || 0));
  const recent = (data.documents || []).slice(0, 5);
  const totalDocs = (data.documents || []).reduce((sum: number, d: any) => sum + Number(d.importe_total ?? d.total ?? 0), 0);

  const pasos: Paso[] = [
    {
      clave: "empresa",
      titulo: "Completá los datos de tu empresa",
      corto: ajustes?.logoUrl ? "Logo cargado. Revisá los datos fiscales y de contacto." : "Razón social, CUIT, dirección y logo para los comprobantes.",
      detalle: "En Empresa cargás los datos que salen impresos en facturas, recibos y remitos: razón social, CUIT, domicilio, teléfonos, logo y pie de página.",
      hecho: Boolean(ajustes?.logoUrl),
      ir: "company",
      boton: "Ir a Empresa",
    },
    {
      clave: "puntos",
      titulo: "Configurá tu punto de venta",
      corto: puntos.length ? `Tenés ${puntos.length} punto(s) de venta creado(s).` : "Creá tu punto de venta con sus datos, logo y numeración.",
      detalle: "Cada punto de venta tiene sus propios datos, logo y numeración (facturas, notas de venta, remitos y recibos). Después asigná los cajeros y las cajas.",
      hecho: puntos.length > 0,
      ir: "point-sales",
      boton: "Ir a Puntos de venta",
    },
    {
      clave: "productos",
      titulo: "Cargá tus productos",
      corto: data.products.length ? `Ya tenés ${data.products.length} producto(s).` : "Cargá uno a uno o importá tu catálogo desde un archivo.",
      detalle: "Podés cargar productos con código de barras, precios, rubros y stock, o importar todo el catálogo de una vez desde Excel/CSV.",
      hecho: data.products.length > 0,
      ir: "products",
      boton: "Ir a Productos",
    },
    {
      clave: "clientes",
      titulo: "Cargá tus clientes",
      corto: data.clients.length ? `Ya tenés ${data.clients.length} cliente(s).` : "Cargá clientes para vender a cuenta y tomar pedidos.",
      detalle: "Con los clientes cargados podés vender en cuenta corriente, enviar avisos por WhatsApp y armar la cartera de cada vendedor.",
      hecho: data.clients.length > 0,
      ir: "clients",
      boton: "Ir a Clientes",
    },
    {
      clave: "usuarios",
      titulo: "Sumá a tu equipo",
      corto: usuarios.length > 1 ? `Hay ${usuarios.length} usuarios creados.` : "Creá usuarios para tus cajeros, vendedores y repartidores.",
      detalle: "Cada persona entra con su propio usuario (o nombre de usuario) y rol. Los roles definen qué pantallas ve cada uno.",
      hecho: usuarios.length > 1,
      ir: "users",
      boton: "Ir a Usuarios",
    },
  ];

  if (modulos?.TIENDANUBE) {
    pasos.push({
      clave: "tiendanube",
      titulo: "Conectá tu tienda de Tiendanube",
      corto: tiendanube?.configurado ? "Conexión configurada con Tiendanube." : "Sincronizá productos, stock y pedidos con tu tienda online.",
      detalle: "Cargá el ID de tienda y el token de Tiendanube y compartí productos, stock y pedidos cuando quieras (sin procesos en segundo plano).",
      hecho: Boolean(tiendanube?.configurado && tiendanube?.activo),
      ir: "tiendanube",
      boton: "Ir a Tiendanube",
    });
  }

  const pendientes = pasos.filter((p) => !p.hecho);
  const pasoAbierto = abierto ?? (pendientes[0]?.clave || null);

  return <div className="dashboard-page">
    {error && <div className="error-box">{error}</div>}

    <div className="products-card onboard-card">
      <div className="onboard-head">
        <Store size={20} />
        <div>
          <h3>¡Dejá el sistema a tu manera!</h3>
          <p>{pendientes.length ? `Te quedan ${pendientes.length} paso(s) para terminar de configurarlo.` : "¡Listo! Ya completaste todos los pasos iniciales."}</p>
        </div>
      </div>
      {pasos.map((p) => {
        const esAbierto = pasoAbierto === p.clave;
        return <div key={p.clave} className={"onboard-step" + (p.hecho ? " hecho" : "")}>
          <button className="onboard-step-head" onClick={() => setAbierto(esAbierto ? "" : p.clave)}>
            <span className="onboard-check">{p.hecho ? <Check size={15} /> : null}</span>
            <span className="onboard-text"><strong>{p.titulo}</strong><small>{p.corto}</small></span>
            {esAbierto ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          </button>
          {esAbierto && <div className="onboard-step-body">
            <p>{p.detalle}</p>
            <button className="primary-action" onClick={() => onNavigate(p.ir)}>{p.boton}</button>
          </div>}
        </div>;
      })}
    </div>

    <div className="dashboard-cards">
      <button onClick={() => onNavigate("products")}><PackageSearch /><span>Productos activos</span><strong>{data.products.length}</strong></button>
      <button onClick={() => onNavigate("clients")}><Users /><span>Clientes</span><strong>{data.clients.length}</strong></button>
      <button className={alerts.length ? "warning" : ""} onClick={() => onNavigate("stock")}><Warehouse /><span>Alertas de stock</span><strong>{alerts.length}</strong></button>
      <button onClick={() => onNavigate("documents")}><Receipt /><span>Total documentos</span><strong>$ {totalDocs.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</strong></button>
    </div>

    <div className="dashboard-grid">
      <section>
        <div className="dashboard-head"><div><h3>Alertas de inventario</h3><p>Productos sin stock o por debajo del mínimo.</p></div><button onClick={() => onNavigate("stock")}>Ver inventario</button></div>
        {alerts.length ? <div className="dashboard-list">{alerts.slice(0, 8).map((r: any, i: number) => <article key={r.id || i}><div><strong>{r.descripcion || `Producto #${r.producto_id}`}</strong><span>{r.codigo || "Sin código"}</span></div><b>{Number(r.disponible ?? r.cantidad ?? 0).toLocaleString("es-AR")}</b></article>)}</div> : <div className="dashboard-empty">No hay alertas de stock.</div>}
      </section>
      <section>
        <div className="dashboard-head"><div><h3>Documentos recientes</h3><p>Últimas operaciones del chat, POS y WhatsApp.</p></div><button onClick={() => onNavigate("documents")}>Ver todos</button></div>
        {recent.length ? <div className="dashboard-list">{recent.map((d: any, i: number) => <article key={d.id || i}><div><strong>{d.tipo || d.tipo_documento || "DOCUMENTO"} {String(d.punto_venta || 1).padStart(4, "0")}-{String(d.numero || 0).padStart(8, "0")}</strong><span>{d.estado || "BORRADOR"}</span></div><b>$ {Number(d.importe_total ?? d.total ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</b></article>)}</div> : <div className="dashboard-empty">Todavía no hay documentos.</div>}
      </section>
    </div>

    <div className="quick-module-row">
      <button onClick={() => onNavigate("chat")}><MessageSquareText /><span><strong>Nueva operación</strong><small>Facturar conversando</small></span></button>
      <button onClick={() => onNavigate("pos")}><ShoppingCart /><span><strong>Abrir POS</strong><small>Venta rápida</small></span></button>
      <button onClick={() => onNavigate("accounts")}><BadgeDollarSign /><span><strong>Cuentas corrientes</strong><small>Consultar y cobrar</small></span></button>
    </div>
  </div>;
}
