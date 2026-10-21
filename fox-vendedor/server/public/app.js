const CLAVE_TOKEN = "fox_vendedor_token";
const CLAVE_LISTA = "fox_vendedor_lista";

const estado = {
  token: localStorage.getItem(CLAVE_TOKEN) || "",
  vendedor: "",
  lista: Math.min(4, Math.max(1, Number(localStorage.getItem(CLAVE_LISTA)) || 1)),
  articulos: [],
  carrito: [],
  vista: "precios",
  consulta: "",
  abort: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function esc(valor) {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moneda(valor) {
  return "$ " + Number(valor || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fecha(valor) {
  if (!valor) return "-";
  try {
    return new Date(valor).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(valor);
  }
}

let avisoTimer = null;
function avisar(mensaje) {
  const caja = $("#aviso");
  caja.textContent = mensaje;
  caja.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { caja.hidden = true; }, 2800);
}

async function api(ruta, opciones = {}) {
  const headers = { "Content-Type": "application/json", ...(opciones.headers || {}) };
  if (estado.token) headers.Authorization = "Bearer " + estado.token;
  const respuesta = await fetch(ruta, { ...opciones, headers });
  let datos = null;
  try { datos = await respuesta.json(); } catch { datos = {}; }
  if (respuesta.status === 401) {
    estado.token = "";
    estado.vendedor = "";
    localStorage.removeItem(CLAVE_TOKEN);
    mostrarAcceso(datos.error || "Sesión vencida. Pedí un código nuevo.");
    throw new Error(datos.error || "Sesión vencida. Pedí un código nuevo.");
  }
  if (!respuesta.ok) throw new Error(datos.error || "No se pudo completar la operación.");
  return datos;
}

function precioDe(articulo) {
  const precios = Array.isArray(articulo.precios) ? articulo.precios : [];
  return Number(precios[estado.lista - 1] || precios[0] || articulo.precio || 0);
}

function mostrarAcceso(mensaje = "") {
  $("#app").hidden = true;
  $("#pantalla-acceso").hidden = false;
  const error = $("#error-acceso");
  error.hidden = !mensaje;
  error.textContent = mensaje;
  setTimeout(() => $("#codigo")?.focus(), 100);
}

function mostrarApp() {
  $("#pantalla-acceso").hidden = true;
  $("#app").hidden = false;
  $("#nombre-vendedor").textContent = estado.vendedor || "Vendedor";
  $("#lista-precio").value = String(estado.lista);
  renderResultados();
  renderCarrito();
  cambiarVista("precios");
}

function cerrarSesion(recargar = true) {
  estado.token = "";
  estado.vendedor = "";
  estado.articulos = [];
  estado.carrito = [];
  localStorage.removeItem(CLAVE_TOKEN);
  if (recargar) mostrarAcceso();
}

async function iniciar() {
  if (!estado.token) return mostrarAcceso();
  try {
    const perfil = await api("/api/perfil");
    estado.vendedor = perfil.vendedor || "Vendedor";
    mostrarApp();
  } catch (error) {
    mostrarAcceso(error.message);
  }
}

async function ingresar(evento) {
  evento.preventDefault();
  const boton = $("#btn-ingresar");
  const codigo = $("#codigo").value.trim();
  if (!/^\d{6,10}$/.test(codigo)) return mostrarAcceso("Ingresá el código de 8 dígitos.");
  boton.disabled = true;
  boton.textContent = "Ingresando...";
  try {
    const datos = await fetch("/api/acceso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    }).then(async (r) => ({ ok: r.ok, status: r.status, datos: await r.json().catch(() => ({})) }));
    if (!datos.ok) throw new Error(datos.datos.error || "No se pudo ingresar.");
    estado.token = datos.datos.token;
    estado.vendedor = datos.datos.nombre || "Vendedor";
    localStorage.setItem(CLAVE_TOKEN, estado.token);
    mostrarApp();
  } catch (error) {
    mostrarAcceso(error.message);
  } finally {
    boton.disabled = false;
    boton.textContent = "Ingresar";
  }
}

function cambiarVista(vista) {
  estado.vista = vista;
  $$(".vista").forEach((seccion) => { seccion.hidden = seccion.id !== `vista-${vista}`; });
  $$(".barra-inferior button").forEach((boton) => boton.classList.toggle("activo", boton.dataset.vista === vista));
  if (vista === "historial") cargarHistorial();
  if (vista === "precios") setTimeout(() => $("#buscar")?.focus(), 80);
  if (vista === "presupuesto") renderCarrito();
}

function renderResultados() {
  const caja = $("#resultados");
  if (!estado.articulos.length) {
    caja.innerHTML = estado.consulta ? `<div class="vacio">No se encontraron artículos.</div>` : `<div class="vacio">Buscá por código, código de barras o descripción.</div>`;
    return;
  }
  caja.innerHTML = estado.articulos.map((a) => {
    const partes = [a.codigo ? `Código ${a.codigo}` : "", a.codbarra ? `Barra ${a.codbarra}` : "", `Stock ${Number(a.stock || 0).toLocaleString("es-AR")}`].filter(Boolean);
    return `<article class="articulo">
      <div>
        <strong>${esc(a.descripcion)}</strong>
        <small>${esc(partes.join(" · "))}</small>
        <span class="precio">${moneda(precioDe(a))}</span>
      </div>
      <button type="button" data-agregar="${a.idart}" aria-label="Agregar ${esc(a.descripcion)}">+</button>
    </article>`;
  }).join("");
}

async function buscar() {
  const consulta = $("#buscar").value.trim();
  estado.consulta = consulta;
  const estadoTexto = $("#estado-busqueda");
  if (!consulta) {
    estado.articulos = [];
    estadoTexto.textContent = "";
    renderResultados();
    return;
  }
  if (estado.abort) estado.abort.abort();
  estado.abort = new AbortController();
  estadoTexto.textContent = "Buscando...";
  try {
    const datos = await api(`/api/articulos?q=${encodeURIComponent(consulta)}&lista=${estado.lista}`, { signal: estado.abort.signal });
    estado.articulos = datos.articulos || [];
    estadoTexto.textContent = `${estado.articulos.length} resultado${estado.articulos.length === 1 ? "" : "s"}`;
    renderResultados();
  } catch (error) {
    if (error.name === "AbortError") return;
    estadoTexto.textContent = "";
    avisar(error.message);
  }
}

function agregar(idart) {
  const articulo = estado.articulos.find((a) => Number(a.idart) === Number(idart));
  if (!articulo) return;
  const existente = estado.carrito.find((i) => Number(i.idart) === Number(idart));
  if (existente) existente.cantidad += 1;
  else estado.carrito.push({ idart: Number(articulo.idart), codigo: articulo.codigo, descripcion: articulo.descripcion, precios: articulo.precios, cantidad: 1 });
  renderCarrito();
  avisar("Agregado al presupuesto");
}

function renderCarrito() {
  const caja = $("#carrito");
  const badge = $("#badge-carrito");
  const total = estado.carrito.reduce((suma, item) => suma + precioDe(item) * item.cantidad, 0);
  const unidades = estado.carrito.reduce((suma, item) => suma + item.cantidad, 0);
  if (badge) {
    badge.textContent = String(unidades);
    badge.hidden = unidades === 0;
  }
  $("#total-carrito").textContent = moneda(total);
  $("#btn-enviar").disabled = !estado.carrito.length;
  if (!estado.carrito.length) {
    caja.innerHTML = `<div class="vacio">Agregá artículos desde la pestaña Precios.</div>`;
    return;
  }
  caja.innerHTML = estado.carrito.map((item, indice) => `<div class="item-carrito">
    <div class="linea1"><strong>${esc(item.descripcion)}</strong><span class="subtotal">${moneda(precioDe(item) * item.cantidad)}</span></div>
    <small>${esc(item.codigo || "")}</small>
    <div class="controles">
      <button type="button" data-cantidad="-1" data-indice="${indice}">−</button>
      <span>${item.cantidad}</span>
      <button type="button" data-cantidad="1" data-indice="${indice}">+</button>
      <small>${moneda(precioDe(item))} c/u</small>
      <button type="button" class="icono" data-quitar="${indice}" style="margin-left:auto;background:#fee2e2;color:#b91c1c">Quitar</button>
    </div>
  </div>`).join("");
}

function cambiarCantidad(indice, delta) {
  const item = estado.carrito[indice];
  if (!item) return;
  item.cantidad = Math.max(0, item.cantidad + delta);
  if (item.cantidad === 0) estado.carrito.splice(indice, 1);
  renderCarrito();
}

async function enviarPresupuesto() {
  if (!estado.carrito.length) return;
  const boton = $("#btn-enviar");
  boton.disabled = true;
  boton.textContent = "Enviando...";
  try {
    const datos = await api("/api/presupuestos", {
      method: "POST",
      body: JSON.stringify({
        lista: estado.lista,
        cliente: $("#cliente").value.trim(),
        observaciones: $("#observaciones").value.trim(),
        items: estado.carrito.map((item) => ({ idart: item.idart, cantidad: item.cantidad })),
      }),
    });
    estado.carrito = [];
    $("#cliente").value = "";
    $("#observaciones").value = "";
    renderCarrito();
    avisar(`Presupuesto ${datos.presupuesto.numeroLocal} guardado`);
    cambiarVista("historial");
  } catch (error) {
    avisar(error.message);
  } finally {
    boton.disabled = false;
    boton.textContent = "Enviar presupuesto";
  }
}

function estadoPresupuesto(p) {
  if (p.estado === "SINCRONIZADO") return { clase: "estado-sincronizado", texto: p.fox_numero ? `Cargado en Fox N° ${p.fox_numero}` : "Cargado en Fox" };
  if (p.estado === "ERROR") return { clase: "estado-error", texto: "Error de sincronización" };
  return { clase: "estado-pendiente", texto: "Pendiente de enviar a Fox" };
}

async function cargarHistorial() {
  const caja = $("#historial");
  caja.innerHTML = `<div class="vacio">Cargando...</div>`;
  try {
    const datos = await api("/api/presupuestos");
    if (!datos.presupuestos?.length) {
      caja.innerHTML = `<div class="vacio">Todavía no enviaste presupuestos.</div>`;
      return;
    }
    caja.innerHTML = datos.presupuestos.map((p) => {
      const st = estadoPresupuesto(p);
      return `<button type="button" class="presupuesto-card" data-presupuesto="${p.id}">
        <div class="fila"><strong>WEB-${String(p.id).padStart(6, "0")}</strong><strong>${moneda(p.total)}</strong></div>
        <div class="fila"><small>${esc(p.cliente || "CONSUMIDOR FINAL")}</small><small>${fecha(p.creado_en)}</small></div>
        <span class="estado ${st.clase}">${st.texto}</span>
      </button>`;
    }).join("");
  } catch (error) {
    caja.innerHTML = `<div class="vacio">${esc(error.message)}</div>`;
  }
}

async function verDetalle(id) {
  try {
    const datos = await api(`/api/presupuestos/${id}`);
    const p = datos.presupuesto;
    $("#detalle-titulo").textContent = `WEB-${String(p.id).padStart(6, "0")}`;
    $("#detalle-contenido").innerHTML = `
      <div class="detalle-linea"><span>Cliente</span><strong>${esc(p.cliente || "CONSUMIDOR FINAL")}</strong></div>
      <div class="detalle-linea"><span>Vendedor</span><strong>${esc(p.vendedor)}</strong></div>
      <div class="detalle-linea"><span>Lista</span><strong>${p.lista_precio}</strong></div>
      <div class="detalle-linea"><span>Estado</span><strong>${estadoPresupuesto(p).texto}</strong></div>
      <div style="margin:14px 0 6px"><strong>Artículos</strong></div>
      ${(p.items || []).map((i) => `<div class="detalle-linea"><span>${esc(i.cantidad)} × ${esc(i.descripcion)}</span><strong>${moneda(i.total)}</strong></div>`).join("")}
      <div class="detalle-linea"><span>Total</span><strong>${moneda(p.total)}</strong></div>
      ${p.observaciones ? `<div class="detalle-linea"><span>Observaciones</span><strong>${esc(p.observaciones)}</strong></div>` : ""}`;
    $("#dialogo-detalle").showModal();
  } catch (error) {
    avisar(error.message);
  }
}

let timerBusqueda = null;

document.addEventListener("DOMContentLoaded", () => {
  $("#form-acceso").addEventListener("submit", ingresar);
  $("#btn-salir").addEventListener("click", () => {
    if (confirm("¿Cerrar la sesión? Para volver a entrar necesitás un código nuevo.")) cerrarSesion();
  });
  $("#btn-buscar").addEventListener("click", buscar);
  $("#buscar").addEventListener("input", () => {
    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(buscar, 260);
  });
  $("#buscar").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") { evento.preventDefault(); clearTimeout(timerBusqueda); buscar(); }
  });
  $("#lista-precio").addEventListener("change", (evento) => {
    estado.lista = Math.min(4, Math.max(1, Number(evento.target.value) || 1));
    localStorage.setItem(CLAVE_LISTA, String(estado.lista));
    renderResultados();
    renderCarrito();
  });
  $("#resultados").addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-agregar]");
    if (boton) agregar(Number(boton.dataset.agregar));
  });
  $("#carrito").addEventListener("click", (evento) => {
    const cantidad = evento.target.closest("[data-cantidad]");
    const quitar = evento.target.closest("[data-quitar]");
    if (cantidad) cambiarCantidad(Number(cantidad.dataset.indice), Number(cantidad.dataset.cantidad));
    if (quitar) cambiarCantidad(Number(quitar.dataset.quitar), -9999);
  });
  $("#btn-enviar").addEventListener("click", enviarPresupuesto);
  $$(".barra-inferior button").forEach((boton) => boton.addEventListener("click", () => cambiarVista(boton.dataset.vista)));
  $("#historial").addEventListener("click", (evento) => {
    const tarjeta = evento.target.closest("[data-presupuesto]");
    if (tarjeta) verDetalle(Number(tarjeta.dataset.presupuesto));
  });
  $("#cerrar-detalle").addEventListener("click", () => $("#dialogo-detalle").close());

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  iniciar();
});
