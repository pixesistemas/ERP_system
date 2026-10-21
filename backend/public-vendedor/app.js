const estado = {
  vendedor: "",
  empresa: "",
  productos: [],
  clientes: [],
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
  const respuesta = await fetch(ruta, { ...opciones, headers });
  let datos = null;
  try { datos = await respuesta.json(); } catch { datos = {}; }
  if (respuesta.status === 401) {
    const mensaje = /Falta el token/.test(String(datos.error || "")) ? "" : (datos.error || "Sesión vencida. Pedí un código nuevo.");
    mostrarAcceso(mensaje);
    throw new Error(datos.error || "Sesión vencida. Pedí un código nuevo.");
  }
  if (!respuesta.ok) throw new Error(datos.error || "No se pudo completar la operación.");
  return datos;
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
  renderClientes();
  renderResultados();
  renderCarrito();
  cambiarVista("precios");
}

function cerrarSesion() {
  fetch("/api/v1/vendedor/salir", { method: "POST" }).catch(() => {});
  estado.vendedor = "";
  estado.empresa = "";
  estado.productos = [];
  estado.clientes = [];
  estado.carrito = [];
  mostrarAcceso();
}

async function cargarBootstrap() {
  const datos = await api("/api/v1/vendedor/bootstrap");
  estado.vendedor = datos.vendedor?.nombre || "Vendedor";
  estado.empresa = datos.empresa?.nombre || "";
  estado.productos = datos.productos || [];
  estado.clientes = datos.clientes || [];
  $("#nombre-vendedor").textContent = `${estado.vendedor}${estado.empresa ? " · " + estado.empresa : ""}`;
  renderClientes();
  renderResultados();
  renderCarrito();
}

async function iniciar() {
  try {
    await cargarBootstrap();
    mostrarApp();
  } catch (error) {
    mostrarAcceso(/Falta el token/.test(String(error.message)) ? "" : error.message);
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
    const respuesta = await fetch("/api/v1/vendedor/acceso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || "No se pudo ingresar.");
    estado.vendedor = datos.vendedor?.nombre || "Vendedor";
    estado.empresa = datos.empresa?.nombre || "";
    await cargarBootstrap();
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

function renderClientes() {
  const select = $("#cliente");
  const actual = select.value;
  select.innerHTML = `<option value="">${estado.clientes.length ? "Seleccionar cliente..." : "No tenés clientes asignados en tu cartera"}</option>` +
    estado.clientes.map((c) => `<option value="${c.id}">${esc(c.razon_social)}${c.cuit ? " · " + esc(c.cuit) : c.dni ? " · " + esc(c.dni) : ""}</option>`).join("");
  if (actual) select.value = actual;
}

function renderResultados() {
  const caja = $("#resultados");
  const q = estado.consulta.toLowerCase().trim();
  let filtrados = estado.productos;
  if (q) {
    filtrados = estado.productos.filter((p) =>
      `${p.codigo || ""} ${p.codigoBarra || ""} ${p.descripcion || ""}`.toLowerCase().includes(q),
    );
  }
  const total = filtrados.length;
  const lista = filtrados.slice(0, 80);
  $("#estado-busqueda").textContent = q ? `${total} resultado${total === 1 ? "" : "s"}` : `${Math.min(80, total)} de ${total} productos`;
  if (!lista.length) {
    caja.innerHTML = `<div class="vacio">No se encontraron productos.</div>`;
    return;
  }
  caja.innerHTML = lista.map((p) => {
    const detalle = [p.codigo ? `Código ${p.codigo}` : "", p.codigoBarra ? `Barra ${p.codigoBarra}` : "", `Stock ${Number(p.stock || 0).toLocaleString("es-AR")}`].filter(Boolean);
    return `<article class="articulo">
      <div>
        <strong>${esc(p.descripcion)}</strong>
        <small>${esc(detalle.join(" · "))}</small>
        <span class="precio">${moneda(p.precio)}</span>
      </div>
      <button type="button" data-agregar="${p.id}" aria-label="Agregar ${esc(p.descripcion)}">+</button>
    </article>`;
  }).join("");
}

function buscar() {
  estado.consulta = $("#buscar").value;
  renderResultados();
}

function agregar(id) {
  const producto = estado.productos.find((p) => Number(p.id) === Number(id));
  if (!producto) return;
  const existente = estado.carrito.find((i) => Number(i.id) === Number(id));
  if (existente) existente.cantidad += 1;
  else estado.carrito.push({ id: Number(producto.id), codigo: producto.codigo, descripcion: producto.descripcion, precio: Number(producto.precio || 0), iva: Number(producto.iva || 0), cantidad: 1 });
  renderCarrito();
  avisar("Agregado al presupuesto");
}

function renderCarrito() {
  const caja = $("#carrito");
  const badge = $("#badge-carrito");
  const total = estado.carrito.reduce((suma, item) => suma + Number(item.precio) * item.cantidad, 0);
  const unidades = estado.carrito.reduce((suma, item) => suma + item.cantidad, 0);
  if (badge) {
    badge.textContent = String(unidades);
    badge.hidden = unidades === 0;
  }
  $("#total-carrito").textContent = moneda(total);
  $("#btn-enviar").disabled = !estado.carrito.length;
  if (!estado.carrito.length) {
    caja.innerHTML = `<div class="vacio">Agregá productos desde la pestaña Precios.</div>`;
    return;
  }
  caja.innerHTML = estado.carrito.map((item, indice) => `<div class="item-carrito">
    <div class="linea1"><strong>${esc(item.descripcion)}</strong><span class="subtotal">${moneda(item.precio * item.cantidad)}</span></div>
    <small>${esc(item.codigo || "")}</small>
    <div class="controles">
      <button type="button" data-cantidad="-1" data-indice="${indice}">−</button>
      <span>${item.cantidad}</span>
      <button type="button" data-cantidad="1" data-indice="${indice}">+</button>
      <small>${moneda(item.precio)} c/u</small>
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
  if (!estado.carrito.length) return avisar("Agregá al menos un producto.");
  const clienteId = Number($("#cliente").value);
  if (!clienteId) return avisar("Seleccioná un cliente de tu cartera.");
  const boton = $("#btn-enviar");
  boton.disabled = true;
  boton.textContent = "Enviando...";
  try {
    const datos = await api("/api/v1/vendedor/presupuestos", {
      method: "POST",
      body: JSON.stringify({
        cliente_id: clienteId,
        observaciones: $("#observaciones").value.trim(),
        items: estado.carrito.map((item) => ({ producto_id: item.id, cantidad: item.cantidad })),
      }),
    });
    const documento = datos.documento || {};
    estado.carrito = [];
    $("#observaciones").value = "";
    $("#cliente").value = "";
    renderCarrito();
    avisar(`Presupuesto ${String(documento.punto_venta || "").padStart(4, "0")}-${String(documento.numero || "").padStart(8, "0")} guardado`);
    cambiarVista("historial");
  } catch (error) {
    avisar(error.message);
  } finally {
    boton.disabled = false;
    boton.textContent = "Enviar presupuesto";
  }
}

async function cargarHistorial() {
  const caja = $("#historial");
  caja.innerHTML = `<div class="vacio">Cargando...</div>`;
  try {
    const datos = await api("/api/v1/vendedor/presupuestos");
    if (!datos.presupuestos?.length) {
      caja.innerHTML = `<div class="vacio">Todavía no enviaste presupuestos.</div>`;
      return;
    }
    caja.innerHTML = datos.presupuestos.map((p) => `<button type="button" class="presupuesto-card" data-presupuesto="${p.id}">
      <div class="fila"><strong>${String(p.punto_venta || "").padStart(4, "0")}-${String(p.numero || "").padStart(8, "0")}</strong><strong>${moneda(p.importe_total)}</strong></div>
      <div class="fila"><small>${esc(p.cliente || "CONSUMIDOR FINAL")}</small><small>${fecha(p.fecha)}</small></div>
      <span class="estado estado-sincronizado">${esc(p.estado || "BORRADOR")}</span>
    </button>`).join("");
  } catch (error) {
    caja.innerHTML = `<div class="vacio">${esc(error.message)}</div>`;
  }
}

async function verDetalle(id) {
  try {
    const datos = await api(`/api/v1/vendedor/presupuestos/${id}`);
    const p = datos.documento;
    $("#detalle-titulo").textContent = `${String(p.punto_venta || "").padStart(4, "0")}-${String(p.numero || "").padStart(8, "0")}`;
    $("#detalle-contenido").innerHTML = `
      <div class="detalle-linea"><span>Cliente</span><strong>${esc(p.cliente)}</strong></div>
      <div class="detalle-linea"><span>Estado</span><strong>${esc(p.estado)}</strong></div>
      <div class="detalle-linea"><span>Fecha</span><strong>${fecha(p.fecha)}</strong></div>
      <div style="margin:14px 0 6px"><strong>Productos</strong></div>
      ${(p.items || []).map((i) => `<div class="detalle-linea"><span>${esc(i.cantidad)} × ${esc(i.descripcion)}</span><strong>${moneda(i.total)}</strong></div>`).join("")}
      <div class="detalle-linea"><span>Total</span><strong>${moneda(p.importe_total)}</strong></div>
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
  $("#btn-actualizar").addEventListener("click", async () => {
    try {
      await cargarBootstrap();
      avisar("Precios actualizados");
    } catch (error) {
      avisar(error.message);
    }
  });
  $("#btn-buscar").addEventListener("click", buscar);
  $("#buscar").addEventListener("input", () => {
    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(buscar, 220);
  });
  $("#buscar").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      clearTimeout(timerBusqueda);
      buscar();
    }
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
    navigator.serviceWorker.register("/vendedor/sw.js").catch(() => {});
  }

  iniciar();
});
