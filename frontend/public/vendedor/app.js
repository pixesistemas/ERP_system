const estado = {
  token: "",
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

async function refrescarSesion() {
  try {
    const respuesta = await fetch("/api/v1/vendedor/refresh", { method: "POST" });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) return { ok: false, error: datos.error || "" };
    estado.token = datos.token || "";
    estado.vendedor = datos.vendedor?.nombre || "Vendedor";
    estado.empresa = datos.empresa?.nombre || "";
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor." };
  }
}

async function api(ruta, opciones = {}, reintentar = true) {
  const headers = { "Content-Type": "application/json", ...(opciones.headers || {}) };
  if (estado.token) headers.Authorization = "Bearer " + estado.token;
  const respuesta = await fetch(ruta, { ...opciones, headers });
  let datos = null;
  try { datos = await respuesta.json(); } catch { datos = {}; }
  if (respuesta.status === 401) {
    if (reintentar) {
      const sesion = await refrescarSesion();
      if (sesion.ok) return api(ruta, opciones, false);
      mostrarAcceso(/No hay una sesión/.test(String(sesion.error)) ? "" : sesion.error);
      throw new Error(sesion.error || "Sesión vencida.");
    }
    mostrarAcceso(datos.error || "Sesión vencida. Iniciá sesión de nuevo.");
    throw new Error(datos.error || "Sesión vencida. Iniciá sesión de nuevo.");
  }
  if (!respuesta.ok) throw new Error(datos.error || "No se pudo completar la operación.");
  return datos;
}

function mostrarAcceso(mensaje = "") {
  $("#app").hidden = true;
  $("#pantalla-acceso").hidden = false;
  estado.token = "";
  const error = $("#error-acceso");
  error.hidden = !mensaje;
  error.textContent = mensaje;
  setTimeout(() => $("#usuario")?.focus(), 100);
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
  estado.token = "";
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
  const sesion = await refrescarSesion();
  if (!sesion.ok) {
    mostrarAcceso(/No hay una sesión/.test(String(sesion.error)) ? "" : sesion.error);
    return;
  }
  try {
    await cargarBootstrap();
    mostrarApp();
  } catch (error) {
    mostrarAcceso(error.message);
  }
}

async function ingresar(evento) {
  evento.preventDefault();
  const boton = $("#btn-ingresar");
  const usuario = $("#usuario").value.trim();
  const password = $("#password").value;
  const empresaId = Number($("#empresa").value) || undefined;
  if (!usuario || !password) return mostrarAcceso("Ingresá usuario/email y contraseña.");

  boton.disabled = true;
  boton.textContent = "Ingresando...";
  try {
    const respuesta = await fetch("/api/v1/vendedor/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password, empresaId }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || "No se pudo ingresar.");

    if (datos.requiereEmpresa) {
      const select = $("#empresa");
      select.innerHTML = datos.empresas.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("");
      $("#empresa-wrap").hidden = false;
      $("#error-acceso").hidden = false;
      $("#error-acceso").textContent = "Elegí la empresa y volvé a tocar Ingresar.";
      setTimeout(() => select.focus(), 80);
      return;
    }

    estado.token = datos.token || "";
    estado.vendedor = datos.vendedor?.nombre || "Vendedor";
    estado.empresa = datos.empresa?.nombre || "";
    $("#empresa-wrap").hidden = true;
    $("#password").value = "";
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
  const lista = $("#clientes-lista");
  lista.innerHTML = estado.clientes
    .map((c) => `<option value="${esc(c.razon_social)}">${esc(c.cuit || c.dni || "")}</option>`)
    .join("");
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
  const existente = estado.carrito.find((i) => !i.manual && Number(i.id) === Number(id));
  if (existente) existente.cantidad += 1;
  else estado.carrito.push({ key: `prod-${producto.id}`, id: Number(producto.id), codigo: producto.codigo, descripcion: producto.descripcion, precio: Number(producto.precio || 0), iva: Number(producto.iva || 0), cantidad: 1 });
  renderCarrito();
  avisar("Agregado al presupuesto");
}

function agregarManual(evento) {
  evento.preventDefault();
  const descripcion = $("#manual-descripcion").value.trim();
  const codigo = $("#manual-codigo").value.trim() || "MANUAL";
  const cantidad = Number(String($("#manual-cantidad").value).replace(",", "."));
  const precio = Number(String($("#manual-precio").value).replace(",", "."));
  const iva = Number($("#manual-iva").value);
  if (!descripcion) return avisar("Escribí la descripción del artículo manual.");
  if (!Number.isFinite(cantidad) || cantidad <= 0) return avisar("Ingresá una cantidad válida.");
  if (!Number.isFinite(precio) || precio <= 0) return avisar("Ingresá un precio válido.");
  estado.carrito.push({
    key: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    manual: true,
    codigo,
    descripcion,
    precio: Math.round((precio + Number.EPSILON) * 100) / 100,
    iva,
    cantidad,
  });
  $("#form-manual").reset();
  $("#manual-iva").value = "21";
  $("#dialogo-manual").close();
  renderCarrito();
  avisar("Artículo manual agregado");
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
    caja.innerHTML = `<div class="vacio">Agregá productos desde Precios o un artículo manual para servicios.</div>`;
    return;
  }
  caja.innerHTML = estado.carrito.map((item, indice) => `<div class="item-carrito">
    <div class="linea1"><strong>${esc(item.descripcion)}</strong><span class="subtotal">${moneda(item.precio * item.cantidad)}</span></div>
    <small>${esc(item.codigo || "")}${item.manual ? " · Manual" : ""}</small>
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
  if (!estado.carrito.length) return avisar("Agregá al menos un producto o artículo manual.");
  const nombreCliente = $("#cliente").value.trim();
  if (!nombreCliente) return avisar("Seleccioná un cliente o escribí su nombre.");
  const clienteCartera = estado.clientes.find((c) => String(c.razon_social).trim().toLowerCase() === nombreCliente.toLowerCase());
  const boton = $("#btn-enviar");
  boton.disabled = true;
  boton.textContent = "Enviando...";
  try {
    const datos = await api("/api/v1/vendedor/presupuestos", {
      method: "POST",
      body: JSON.stringify({
        cliente_id: clienteCartera ? clienteCartera.id : null,
        cliente_nombre: clienteCartera ? "" : nombreCliente,
        observaciones: $("#observaciones").value.trim(),
        items: estado.carrito.map((item) => item.manual
          ? { manual: true, codigo: item.codigo, descripcion: item.descripcion, cantidad: item.cantidad, precio: item.precio, iva: item.iva }
          : { producto_id: item.id, cantidad: item.cantidad }),
      }),
    });
    const documento = datos.documento || {};
    estado.carrito = [];
    $("#observaciones").value = "";
    $("#cliente").value = "";
    renderCarrito();
    avisar(`Presupuesto ${String(documento.punto_venta || "").padStart(4, "0")}-${String(documento.numero || "").padStart(8, "0")} guardado`);
    cambiarVista("historial");
    setTimeout(() => verDetalle(Number(documento.id)), 500);
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
        <div style="margin:14px 0 6px"><strong>Artículos</strong></div>
        ${(p.items || []).map((i) => `<div class="detalle-linea"><span>${esc(i.cantidad)} × ${esc(i.descripcion)}</span><strong>${moneda(i.total)}</strong></div>`).join("")}
        <div class="detalle-linea"><span>Total</span><strong>${moneda(p.importe_total)}</strong></div>
        ${p.observaciones ? `<div class="detalle-linea"><span>Observaciones</span><strong>${esc(p.observaciones)}</strong></div>` : ""}
        <div class="detalle-acciones">
          <button type="button" class="principal" id="btn-compartir-pdf">Compartir PDF</button>
          <button type="button" class="boton-secundario" id="btn-whatsapp-pdf">WhatsApp</button>
        </div>`;
      $("#btn-compartir-pdf").onclick = () => compartirPdf(p);
      $("#btn-whatsapp-pdf").onclick = () => whatsappPdf(p);
      $("#dialogo-detalle").showModal();
    } catch (error) {
      avisar(error.message);
    }
  }

  async function generarPdfPresupuesto(id) {
    const datos = await api(`/api/v1/vendedor/presupuestos/${id}/pdf`, { method: "POST" });
    return {
      url: new URL(datos.url, window.location.origin).href,
      filename: datos.filename || `presupuesto-${id}.pdf`,
    };
  }

  async function compartirPdf(p) {
    const boton = $("#btn-compartir-pdf");
    const textoOriginal = boton?.textContent || "Compartir PDF";
    if (boton) { boton.disabled = true; boton.textContent = "Generando PDF..."; }
    try {
      const pdf = await generarPdfPresupuesto(p.id);
      try {
        const respuesta = await fetch(pdf.url);
        if (!respuesta.ok) throw new Error("No se pudo descargar el PDF.");
        const blob = await respuesta.blob();
        if (typeof File === "function" && navigator.canShare) {
          const archivo = new File([blob], pdf.filename, { type: "application/pdf" });
          if (navigator.canShare({ files: [archivo] })) {
            await navigator.share({
              files: [archivo],
              title: `Presupuesto ${String(p.punto_venta || "").padStart(4, "0")}-${String(p.numero || "").padStart(8, "0")}`,
              text: `Presupuesto de ${p.cliente || "CONSUMIDOR FINAL"}`,
            });
            return;
          }
        }
      } catch (error) {
        if (error?.name === "AbortError") return;
      }

      const enlace = document.createElement("a");
      enlace.href = pdf.url;
      enlace.target = "_blank";
      enlace.rel = "noopener";
      enlace.click();
      try {
        await navigator.clipboard.writeText(pdf.url);
        avisar("PDF generado y link copiado. Compartilo desde el visor o pegá el link.");
      } catch {
        avisar("PDF generado. Compartilo desde el visor.");
      }
    } catch (error) {
      avisar(error.message || "No se pudo generar el PDF.");
    } finally {
      if (boton) { boton.disabled = false; boton.textContent = textoOriginal; }
    }
  }

  async function whatsappPdf(p) {
    const boton = $("#btn-whatsapp-pdf");
    const textoOriginal = boton?.textContent || "WhatsApp";
    if (boton) { boton.disabled = true; boton.textContent = "Generando PDF..."; }
    const ventana = window.open("", "_blank");
    try {
      const pdf = await generarPdfPresupuesto(p.id);
      const numero = `${String(p.punto_venta || "").padStart(4, "0")}-${String(p.numero || "").padStart(8, "0")}`;
      const mensaje = `Presupuesto ${numero} - ${p.cliente || "CONSUMIDOR FINAL"} - Total ${moneda(p.importe_total)}\n${pdf.url}`;
      const urlWhatsapp = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
      if (ventana) ventana.location.href = urlWhatsapp;
      else {
        const enlace = document.createElement("a");
        enlace.href = urlWhatsapp;
        enlace.target = "_blank";
        enlace.rel = "noopener";
        enlace.click();
      }
    } catch (error) {
      if (ventana) ventana.close();
      avisar(error.message || "No se pudo generar el PDF.");
    } finally {
      if (boton) { boton.disabled = false; boton.textContent = textoOriginal; }
    }
  }

let timerBusqueda = null;

document.addEventListener("DOMContentLoaded", () => {
  $("#form-acceso").addEventListener("submit", ingresar);
  $("#btn-salir").addEventListener("click", () => {
    if (confirm("¿Cerrar la sesión en este celular? Después podés volver a entrar con tu usuario y clave.")) cerrarSesion();
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
  $("#btn-manual").addEventListener("click", () => {
    $("#form-manual").reset();
    $("#manual-iva").value = "21";
    $("#manual-cantidad").value = "1";
    $("#dialogo-manual").showModal();
    setTimeout(() => $("#manual-descripcion").focus(), 80);
  });
  $("#form-manual").addEventListener("submit", agregarManual);
  $("#cerrar-manual").addEventListener("click", () => $("#dialogo-manual").close());
  $("#cancelar-manual").addEventListener("click", () => $("#dialogo-manual").close());
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
