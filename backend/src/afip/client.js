const WSAAService = require("./wsaa.service");
const WSFEService = require("./wsfe.service");
const TokenManager = require("./tokenManager");
const PadronService = require("./padron.service");

const { getEmpresaByNombre } = require("../repositories/empresa.repository");

class AFIPClient {
  constructor(empresaConfig) {
    this.company = empresaConfig.nombre;
    this.companyConfig = empresaConfig;

    this.wsaa = new WSAAService(this);
    this.tokenManager = new TokenManager(this);
    this.wsfe = new WSFEService(this);
    this.padron = new PadronService(this);
  }

  static create(nombreEmpresa) {
    const empresaConfig = getEmpresaByNombre(nombreEmpresa);
    return new AFIPClient(empresaConfig);
  }
  static fromEmpresa(empresa) {
    return new AFIPClient({
      id: empresa.id,
      nombre: empresa.nombre,
      cuit: empresa.cuit,
      condicionIVA: empresa.condicionIVA,
      puntoVenta: empresa.puntoVenta,
      production: empresa.production,
      cert: empresa.cert,
      key: empresa.key,
      cache: empresa.cache,
    });
  }

  async login(service = "wsfe") {
    return await this.tokenManager.get(service);
  }
}

module.exports = AFIPClient;
