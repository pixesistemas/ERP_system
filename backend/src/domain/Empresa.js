const { normalizarCondicionIVA } = require("../afip/fiscal.constants");

class Empresa {
  constructor(data) {
    this.id = data.id;
    this.nombre = data.nombre;
    this.razonSocial = data.razonSocial || data.razon_social || data.nombre;
    this.nombreFantasia =
      data.nombreFantasia || data.nombre_fantasia || data.nombre;

    this.cuit = String(data.cuit);
    this.condicionIVA = normalizarCondicionIVA(data.condicionIVA || data.condicion_iva);
    this.puntoVenta = data.puntoVenta || data.punto_venta || 1;
    this.production = data.production || false;

    this.direccion = data.direccion || "";
    this.localidad = data.localidad || "";
    this.provincia = data.provincia || "";
    this.codigoPostal = data.codigoPostal || data.codigo_postal || "";

    this.telefono = data.telefono || "";
    this.whatsapp = data.whatsapp || "";
    this.email = data.email || "";
    this.web = data.web || "";

    this.ingresosBrutos =
      data.ingresosBrutos || data.ingresos_brutos || data.cuit;
    this.inicioActividad = data.inicioActividad || data.inicio_actividad || "";
    this.logo = data.logo || "";

    this.pieFactura = data.pieFactura || data.pie_factura || "";
    this.observaciones = data.observaciones || "";

    this.cert = data.cert;
    this.key = data.key;
    this.cache = data.cache;
  }

  esResponsableInscripto() {
    return this.condicionIVA === "RI";
  }

  esMonotributo() {
    return this.condicionIVA === "MONOTRIBUTO";
  }

  esExento() {
    return this.condicionIVA === "EXENTO";
  }
}

module.exports = Empresa;
