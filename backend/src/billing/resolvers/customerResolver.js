const {
  getClienteByCuit,
  saveCliente,
} = require("../../repositories/cliente.repository");

class CustomerResolver {
  constructor(afipClient) {
    this.afipClient = afipClient;
  }

  async resolve(clienteInput) {
    if (!clienteInput) {
      return this.consumidorFinal();
    }

    if (!clienteInput.cuit) {
      return {
        ...this.consumidorFinal(),
        ...clienteInput,
      };
    }

    const cuit = String(clienteInput.cuit);

    const clienteDb = getClienteByCuit(cuit);

    if (clienteDb) {
      return clienteDb;
    }

    const personaAfip = await this.afipClient.padron.getPersona(Number(cuit));

    const cliente = this.mapPersonaAfip(personaAfip, clienteInput);

    return saveCliente(cliente);
  }

  consumidorFinal() {
    return {
      cuit: null,
      dni: null,
      razonSocial: "CONSUMIDOR FINAL",
      condicionIVA: "CF",
      domicilio: "SIN DIRECCION",
      localidad: null,
      provincia: null,
    };
  }

  mapPersonaAfip(persona, clienteInput) {
    const datos = persona.datosGenerales || {};

    const domicilio = Array.isArray(datos.domicilioFiscal)
      ? datos.domicilioFiscal[0]
      : datos.domicilioFiscal;

    return {
      cuit: String(datos.idPersona || clienteInput.cuit),
      razonSocial:
        datos.razonSocial ||
        `${datos.nombre || ""} ${datos.apellido || ""}`.trim() ||
        clienteInput.razonSocial ||
        "SIN NOMBRE",

      condicionIVA:
        clienteInput.condicionIVA || this.detectarCondicionIVA(persona),

      domicilio: domicilio?.direccion || clienteInput.domicilio || null,
      localidad: domicilio?.localidad || null,
      provincia: domicilio?.descripcionProvincia || null,
    };
  }

  detectarCondicionIVA(persona) {
    const impuestos = persona.datosMonotributo ? ["MONOTRIBUTO"] : [];

    if (impuestos.includes("MONOTRIBUTO")) {
      return "MONOTRIBUTO";
    }

    if (persona.datosGenerales) {
      return "RI";
    }

    return "CF";
  }
}

module.exports = CustomerResolver;
