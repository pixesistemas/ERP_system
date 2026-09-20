require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { create } = require("xmlbuilder2");
const { execFileSync } = require("child_process");
const soap = require("soap");
const { XMLParser } = require("fast-xml-parser");

const constants = require("./constants");

/*
 * Ubica el ejecutable de OpenSSL.
 *
 * OPENSSL puede venir como ruta completa ("/usr/bin/openssl") o como
 * nombre del ejecutable ("openssl"). Si es un nombre simple se deja que
 * el sistema lo busque en el PATH; si es una ruta se verifica que exista
 * y, si no, se prueban las ubicaciones habituales. Así funciona tanto en
 * desarrollo (Windows/Linux) como en el contenedor Docker.
 */
function resolverOpenssl() {
  const env = String(process.env.OPENSSL || "").trim();
  const esRuta = (valor) => valor.includes("/") || valor.includes("\\");
  const candidatos = [];

  if (env) candidatos.push(env);
  candidatos.push("openssl", "/usr/bin/openssl", "/usr/local/bin/openssl", "/bin/openssl");

  for (const candidato of candidatos) {
    if (!candidato) continue;
    if (esRuta(candidato)) {
      try {
        if (fs.existsSync(candidato)) return candidato;
      } catch {
        /* sigue con el próximo */
      }
    } else {
      return candidato;
    }
  }

  return "openssl";
}

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

    const openssl = resolverOpenssl();

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
