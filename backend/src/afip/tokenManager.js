const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

class TokenManager {
  constructor(client) {
    this.client = client;
    this.company = client.companyConfig;

    if (!this.company) {
      throw new Error(`La empresa '${client.company}' no existe.`);
    }
  }

  getTAFile(service) {
    return path.join(this.company.cache, `TA-${service}.xml`);
  }

  exists(service) {
    return fs.existsSync(this.getTAFile(service));
  }

  read(service) {
    const file = this.getTAFile(service);

    if (!fs.existsSync(file)) {
      return null;
    }

    const xml = fs.readFileSync(file, "utf8");

    return this.parse(xml);
  }

  parse(xml) {
    const parser = new XMLParser({
      ignoreAttributes: false,
    });

    const data = parser.parse(xml);
    const response = data.loginTicketResponse;

    return {
      token: response.credentials.token,
      sign: response.credentials.sign,
      generationTime: response.header.generationTime,
      expirationTime: response.header.expirationTime,
    };
  }

  isExpired(auth) {
    if (!auth || !auth.expirationTime) {
      return true;
    }

    const now = new Date();
    const expiration = new Date(auth.expirationTime);

    // margen de seguridad: 10 minutos antes
    const safeExpiration = new Date(expiration.getTime() - 600000);

    return now >= safeExpiration;
  }

  async get(service = "wsfe") {
    const auth = this.read(service);

    if (auth && !this.isExpired(auth)) {
      return {
        ...auth,
        cuit: this.company.cuit,
      };
    }

    const newAuth = await this.client.wsaa.loginCMS(service);

    return {
      ...newAuth,
      cuit: this.company.cuit,
    };
  }
}

module.exports = TokenManager;
