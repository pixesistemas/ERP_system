/*
 * Generador de tickets ESC/POS (lenguaje nativo de las impresoras térmicas).
 *
 * Lo usa el modo "Agente local": el servidor arma el ticket acá y el agente
 * que corre en la PC del local lo manda tal cual a la impresora (por red o
 * por la impresora instalada en el sistema). Sin navegador de por medio.
 *
 * Codificación: los comandos van en ASCII y el texto se convierte a CP437
 * (la página de códigos por defecto de las térmicas), con los acentos y la
 * eñe mapeados a mano. Cualquier carácter desconocido se reemplaza por "?".
 */

const ESC = 0x1b;
const GS = 0x1d;
const ANCHO = 42;

/* Mapa de caracteres españoles a CP437 (por defecto las térmicas usan CP437). */
const CP437 = {
  "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3,
  "Á": 0xb5, "É": 0x90, "Í": 0xd6, "Ó": 0xe0, "Ú": 0xe9,
  "ñ": 0xa4, "Ñ": 0xa5, "ü": 0x81, "Ü": 0x9a,
  "¡": 0xad, "¿": 0xa8, "°": 0xf8, "€": 0xd5,
  "à": 0x85, "è": 0x8a, "ì": 0x8d, "ò": 0x95, "ù": 0x97,
  "ç": 0x87, "Ç": 0x80,
};

function bytesTexto(texto) {
  const salida = [];
  for (const ch of String(texto == null ? "" : texto)) {
    if (CP437[ch] != null) {
      salida.push(CP437[ch]);
    } else {
      const code = ch.charCodeAt(0);
      salida.push(code >= 32 && code < 127 ? code : 0x3f);
    }
  }
  return salida;
}

function money(v) {
  return Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaCorta(fecha) {
  const s = String(fecha || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function envolver(texto, ancho) {
  const palabras = String(texto == null ? "" : texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const tentativa = actual ? `${actual} ${palabra}` : palabra;
    if (tentativa.length <= ancho) {
      actual = tentativa;
    } else {
      if (actual) lineas.push(actual);
      let resto = palabra;
      while (resto.length > ancho) {
        lineas.push(resto.slice(0, ancho));
        resto = resto.slice(ancho);
      }
      actual = resto;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

/* URL del QR fiscal de ARCA/AFIP (mismo formato que exige la RG). */
function urlQrFiscal(sale) {
  if (!sale.cae) return null;
  const cuit = String(sale.empresa_cuit || "").replace(/\D/g, "");
  const tipoCmp = Number(sale.comprobante_tipo_afip || 0);
  if (!cuit || !tipoCmp || !sale.numero) return null;
  const docReceptor = String(sale.cuit || "").replace(/\D/g, "");
  const dniReceptor = String(sale.dni || "").replace(/\D/g, "");
  const data = {
    ver: 1,
    fecha: String(sale.fecha || "").slice(0, 10),
    cuit: Number(cuit),
    ptoVta: Number(sale.punto_venta || 0),
    tipoCmp,
    nroCmp: Number(sale.numero || 0),
    importe: Number(sale.totalFiscal != null ? sale.totalFiscal : sale.total || 0),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: docReceptor ? 80 : dniReceptor ? 96 : 99,
    nroDocRec: Number(docReceptor || dniReceptor || 0),
    tipoCodAut: "E",
    codAut: Number(String(sale.cae || "").replace(/\D/g, "")) || sale.cae,
  };
  const b64 = Buffer.from(JSON.stringify(data), "utf8").toString("base64");
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}

class TicketEscpos {
  constructor(ancho = ANCHO) {
    this.ancho = ancho;
    this.partes = [];
  }

  crudo(...codes) {
    this.partes.push(Buffer.from(codes.flat()));
    return this;
  }

  texto(t, opciones = {}) {
    const align = opciones.align || "left"; /* left | center | right */
    const bold = Boolean(opciones.bold);
    const size = opciones.size || 1; /* 1 normal, 2 doble */
    if (align === "center") this.crudo(ESC, 0x61, 1);
    else if (align === "right") this.crudo(ESC, 0x61, 2);
    else this.crudo(ESC, 0x61, 0);
    if (bold) this.crudo(ESC, 0x45, 1);
    if (size === 2) this.crudo(GS, 0x21, 0x11);
    this.partes.push(Buffer.from(bytesTexto(t)));
    if (size === 2) this.crudo(GS, 0x21, 0x00);
    if (bold) this.crudo(ESC, 0x45, 0);
    this.crudo(0x0a);
    return this;
  }

  lineas(t) {
    for (const l of envolver(t, this.ancho)) this.texto(l);
    return this;
  }

  par(izq, der, opciones = {}) {
    const i = String(izq == null ? "" : izq);
    const d = String(der == null ? "" : der);
    const espacio = Math.max(1, this.ancho - i.length - d.length);
    this.texto(`${i}${" ".repeat(espacio)}${d}`, { bold: Boolean(opciones.bold) });
    return this;
  }

  separador(ch = "-") {
    return this.texto(ch.repeat(this.ancho));
  }

  qr(texto) {
    const data = Buffer.from(bytesTexto(texto));
    const len = data.length + 3;
    return this
      .crudo(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 50, 0) /* modelo 2 */
      .crudo(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 6) /* tamaño */
      .crudo(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 49) /* corrección M */
      .crudo(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30)
      .crudo([...data])
      .crudo(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  }

  cortar() {
    return this.crudo(0x0a, 0x0a, 0x0a, GS, 0x56, 0x00);
  }

  aBuffer() {
    const inicio = Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x00]); /* init + CP437 */
    return Buffer.concat([inicio, ...this.partes]);
  }
}

const NOMBRE_TIPO = {
  FACTURA: "FACTURA",
  NOTA_X: "NOTA DE VENTA",
  NOTA_CREDITO: "NOTA DE CRÉDITO",
  NOTA_DEBITO: "NOTA DE DÉBITO",
  NOTA_PEDIDO: "NOTA DE PEDIDO",
  PRESUPUESTO: "PRESUPUESTO",
  REMITO: "REMITO",
  TICKET_PRUEBA: "TICKET DE PRUEBA",
};

function encabezado(t, { empresa, puntoVenta, titulo, ver = () => true }) {
  const nombre = puntoVenta?.nombre_fantasia || empresa?.nombre_fantasia || empresa?.razon_social || empresa?.nombre || "EMPRESA";
  t.texto(nombre, { align: "center", bold: true, size: 2 });
  const cuit = String(empresa?.cuit || "").trim();
  if (cuit && ver("mostrarDatosFiscales")) t.texto(`CUIT ${cuit}`, { align: "center" });
  const direccion = puntoVenta?.direccion || empresa?.direccion || "";
  if (direccion && ver("mostrarDireccion")) t.texto(direccion, { align: "center" });
  const telefono = puntoVenta?.telefono || empresa?.telefono || "";
  if (telefono && ver("mostrarTelefono")) t.texto(`Tel. ${telefono}`, { align: "center" });
  if (titulo) t.texto(titulo, { align: "center", bold: true });
  t.separador("=");
  return t;
}

function generarTicketEscpos({ empresa, sale, items, puntoVenta, plantilla }) {
  const ver = (clave) => (plantilla || {})[clave] !== false;
  const t = new TicketEscpos();
  const tipoNombre = NOMBRE_TIPO[String(sale.tipo || "").toUpperCase()] || String(sale.tipo || "COMPROBANTE");
  const letra = sale.comprobante_letra ? ` ${sale.comprobante_letra}` : "";
  encabezado(t, { empresa, puntoVenta, titulo: `${tipoNombre}${letra}`, ver });

  t.par(`Nro: ${String(sale.punto_venta || "").padStart(4, "0")}-${String(sale.numero || "").padStart(8, "0")}`.trim(), "");
  t.texto(`Fecha: ${fechaCorta(sale.fecha)}`);
  t.texto(`Cliente: ${sale.cliente || sale.cliente_nombre || "CONSUMIDOR FINAL"}`);
  const doc = String(sale.cuit || sale.dni || "").trim();
  if (doc) t.texto(`Doc: ${doc}`);
  t.texto(`Condición: ${sale.condicion_pago || "CONTADO"}`);
  t.separador();

  /*
   * Factura A (códigos AFIP 1, 2 y 3) discrimina IVA, como exige AFIP.
   * El resto de los comprobantes muestra precios finales (IVA incluido),
   * también en el detalle: es lo que ve el consumidor en la góndola.
   */
  const tipoAfip = Number(sale.comprobante_tipo_afip || 0);
  const esComprobanteA = [1, 2, 3].includes(tipoAfip) || String(sale.comprobante_letra || "").toUpperCase() === "A";
  const tipoComprobante = String(sale.tipo || "").toUpperCase();

  for (const x of items || []) {
    const descripcion = String(x.descripcion || "");
    const cantidad = Number(x.cantidad || 0);
    const precio = Number(x.precio_unitario || x.precio || 0);
    const descuento = Number(x.descuento || 0);
    const ivaPct = Number(x.iva || 0);
    const netoLinea = Number(x.subtotal != null && x.subtotal !== 0
      ? x.subtotal
      : precio * cantidad * (1 - descuento / 100));
    const factor = esComprobanteA ? 1 : 1 + ivaPct / 100;
    const precioMostrar = precio * factor;
    const totalMostrar = netoLinea * factor;
    for (const l of envolver(descripcion, ANCHO)) t.texto(l);
    const izquierda = `  ${cantidad} x $${money(precioMostrar)}${descuento ? ` (-${descuento}%)` : ""}`;
    t.par(izquierda, `$${money(totalMostrar)}`);
  }

  t.separador();
  const descuentoGeneral = Number(sale.descuento_general || 0);
  const recargoGeneral = Number(sale.recargo_general || 0);
  const total = Number(sale.totalFiscal != null && sale.totalFiscal !== 0 ? sale.totalFiscal : sale.total || 0);
  const neto = Number(sale.neto != null ? sale.neto : sale.subtotal || 0);
  const iva = Number(sale.ivaImporte != null ? sale.ivaImporte : Math.max(0, total - neto));
  if (descuentoGeneral) t.par(`Descuento ${descuentoGeneral}%`, `-$${money(Number(sale.descuento_importe || 0))}`);
  if (recargoGeneral) t.par(`Recargo ${recargoGeneral}%`, `+$${money(total * recargoGeneral / (100 + recargoGeneral))}`);
  /*
   * Orden pedido: Neto, IVA y TOTAL (este último en negrita). En los
   * comprobantes sin discriminación se muestra solo el TOTAL.
   */
  if (esComprobanteA) {
    if (neto || iva) {
      t.par("Neto", `$${money(neto)}`);
      t.par("IVA", `$${money(iva)}`);
    }
  }
  t.par("TOTAL", `$${money(total)}`, { bold: true });
  if (!esComprobanteA && tipoComprobante === "FACTURA") {
    /*
     * RG 5614/2024 (Régimen de Transparencia Fiscal al Consumidor):
     * a consumidor final se informa el IVA contenido y los demás
     * impuestos nacionales indirectos, sin discriminar en el detalle.
     */
    const esConsumidorFinal = !String(sale.cuit || "").trim();
    if (esConsumidorFinal) {
      t.separador("-");
      t.lineas("Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)");
      t.texto(`IVA Contenido: $${money(iva)}`);
      t.texto("Otros Impuestos Nacionales Indirectos: $0,00");
    }
  }
  t.separador("=");

  if (sale.cae && ver("mostrarQR")) {
    t.texto(`CAE: ${sale.cae}`, { align: "center", bold: true });
    if (sale.cae_vencimiento) t.texto(`Vto. CAE: ${fechaCorta(sale.cae_vencimiento)}`, { align: "center" });
    t.texto("Comprobante autorizado por ARCA", { align: "center" });
    const qr = urlQrFiscal({ ...sale, empresa_cuit: sale.empresa_cuit || empresa?.cuit });
    if (qr) {
      t.texto("");
      t.qr(qr);
      t.texto("");
    }
  } else if (["NOTA_X", "PRESUPUESTO", "NOTA_PEDIDO"].includes(String(sale.tipo || "").toUpperCase())) {
    t.texto("DOCUMENTO NO VÁLIDO COMO FACTURA", { align: "center", bold: true });
  }

  const pie = empresa?.pie_factura || "";
  if (pie && ver("mostrarPie")) t.lineas(pie);
  t.cortar();
  return t.aBuffer();
}

function generarTicketPruebaEscpos({ empresa, puntoVenta, plantilla }) {
  const ver = (clave) => (plantilla || {})[clave] !== false;
  const t = new TicketEscpos();
  encabezado(t, { empresa, puntoVenta, titulo: "*** TICKET DE PRUEBA ***", ver });
  t.texto(`Punto de venta ${String(puntoVenta?.numero || "").padStart(4, "0")}`);
  t.texto(`Fecha: ${fechaCorta(new Date().toISOString())}`);
  t.separador();
  t.texto("PRODUCTO DE PRUEBA");
  t.par("  1 x $1.000,00", "$1.000,00");
  t.texto("SEGUNDO ARTÍCULO");
  t.par("  2 x $105,00", "$210,00");
  t.separador();
  t.par("TOTAL", "$1.210,00");
  t.separador("=");
  t.texto("Si lee este ticket, la impresora", { align: "center" });
  t.texto("de este punto de venta funciona.", { align: "center" });
  t.cortar();
  return t.aBuffer();
}

module.exports = { generarTicketEscpos, generarTicketPruebaEscpos };
