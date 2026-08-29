require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { create } = require("xmlbuilder2");
const { execFileSync } = require("child_process");
const soap = require("soap");
const { XMLParser } = require("fast-xml-parser");

const constants = require("./constants");

class WSAAService {
  constructor(client) {
    this.client = client;
    this.company = client.companyConfig;

    if (!this.company) {
      throw new Error(`La empresa '${client.company}' no existe.`);
    }

    fs.mkdirSync(this.company.cache, { recursive: true });

    this.wsdl = path.join(__dirname, "../wsdl/wsaa.wsdl");

    this.url = this.company.production
      ? constants.PRODUCCION.WSAA_URL
      : constants.HOMOLOGACION.WSAA_URL;
  }

  createTRA(service) {
    const now = new Date();

    const generation = new Date(now.getTime() - 600000);
    const expiration = new Date(now.getTime() + 600000);

    const xml = create({
      loginTicketRequest: {
        "@version": "1.0",
        header: {
          uniqueId: Math.floor(Date.now() / 1000),
          generationTime: generation.toISOString(),
          expirationTime: expiration.toISOString(),
        },
        service,
      },
    });

    return xml.end({ prettyPrint: true });
  }

  saveTRA(xml, service) {
    const filename = path.join(this.company.cache, `TRA-${service}.xml`);

    fs.writeFileSync(filename, xml);

    return filename;
  }

  signTRA(service) {
    const tra = path.join(this.company.cache, `TRA-${service}.xml`);
    const tmp = path.join(this.company.cache, `TRA-${service}.tmp`);

    // Si no está configurada la variable de entorno OPENSSL, usamos
    // "openssl" a secas y dejamos que el sistema operativo lo busque en el
    // PATH (funciona en Linux/Mac con OpenSSL instalado de fábrica). Antes,
    // sin la variable seteada, esto fallaba con un error de Node poco claro
    // ("paths[0] argument must be of type string") en vez de avisar
    // específicamente que falta configurar OpenSSL.
    const openssl = process.env.OPENSSL
      ? path.resolve(process.env.OPENSSL)
      : "openssl";

    try {
      execFileSync(openssl, [
        "smime",
        "-sign",
        "-in",
        tra,
        "-signer",
        this.company.cert,
        "-inkey",
        this.company.key,
        "-out",
        tmp,
        "-outform",
        "PEM",
        "-nodetach",
      ]);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(
          `No se encontró OpenSSL ("${openssl}"). Instalalo o configurá la variable de entorno OPENSSL con la ruta completa al ejecutable.`,
        );
      }
      throw new Error(`OpenSSL no pudo firmar el pedido de acceso a AFIP: ${error.message}`);
    }

    const cms = fs.readFileSync(tmp, "utf8");

    return cms
      .replace("-----BEGIN PKCS7-----", "")
      .replace("-----END PKCS7-----", "")
      .replace(/\r/g, "")
      .replace(/\n/g, "")
      .trim();
  }

  async loginCMS(service = "wsfe") {
    const xml = this.createTRA(service);

    this.saveTRA(xml, service);

    const cms = this.signTRA(service);

    const soapClient = await soap.createClientAsync(this.wsdl, {
      endpoint: this.url,
    });

    const [result] = await soapClient.loginCmsAsync({
      in0: cms,
    });

    const taXml = result.loginCmsReturn;

    const taFile = path.join(this.company.cache, `TA-${service}.xml`);

    fs.writeFileSync(taFile, taXml);

    return this.parseTA(taXml);
  }

  parseTA(taXml) {
    const parser = new XMLParser({
      ignoreAttributes: false,
    });

    const data = parser.parse(taXml);

    const response = data.loginTicketResponse;

    return {
      token: response.credentials.token,
      sign: response.credentials.sign,
      expirationTime: response.header.expirationTime,
      generationTime: response.header.generationTime,
    };
  }
}

module.exports = WSAAService;
