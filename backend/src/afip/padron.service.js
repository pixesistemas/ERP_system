const path = require("path");
const soap = require("soap");

const constants = require("./constants");

class PadronService {
  constructor(client) {
    this.client = client;
    this.company = client.companyConfig;

    this.wsdl = path.join(__dirname, "../wsdl/ws_sr_padron_a5.wsdl");

    this.url = this.company.production
      ? constants.PRODUCCION.PADRON_A5_URL
      : constants.HOMOLOGACION.PADRON_A5_URL;

    this.soapClient = null;
  }

  async getSoapClient() {
    if (!this.soapClient) {
      this.soapClient = await soap.createClientAsync(this.wsdl, {
        endpoint: this.url,
      });
    }

    return this.soapClient;
  }

  async getPersona(cuit) {
    const auth = await this.client.login("ws_sr_padron_a5");

    const client = await this.getSoapClient();

    const params = {
      token: auth.token,
      sign: auth.sign,
      cuitRepresentada: auth.cuit,
      idPersona: cuit,
    };

    const [result] = await client.getPersonaAsync(params);

    return result.personaReturn;
  }
}

module.exports = PadronService;
