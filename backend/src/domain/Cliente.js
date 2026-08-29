const { normalizarCondicionIVA } = require("../afip/fiscal.constants");

class Cliente {
  constructor(data) {
    this.id = data.id || null;
    this.cuit = data.cuit ? String(data.cuit) : null;
    this.dni = data.dni ? String(data.dni) : null;
    this.razonSocial = data.razonSocial || "CONSUMIDOR FINAL";
    this.condicionIVA = normalizarCondicionIVA(data.condicionIVA || "CF");
    this.domicilio = data.domicilio || "SIN DIRECCION";
    this.localidad = data.localidad || null;
    this.provincia = data.provincia || null;
  }

  esResponsableInscripto() {
    return this.condicionIVA === "RI";
  }

  esMonotributo() {
    return this.condicionIVA === "MONOTRIBUTO";
  }

  esConsumidorFinal() {
    return this.condicionIVA === "CF";
  }

  esExento() {
    return this.condicionIVA === "EXENTO";
  }
}

module.exports = Cliente;
