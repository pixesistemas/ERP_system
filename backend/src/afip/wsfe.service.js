const path = require("path");
const soap = require("soap");

const constants = require("./constants");
const {
  CONDICION_IVA_RECEPTOR,
  CONDICION_IVA_RECEPTOR_TABLA,
  condicionIvaReceptorParaClase,
  getLetraComprobante,
} = require("./fiscal.constants");

function redondear(n) {
  return Math.round(Number(n) * 100) / 100;
}

class WSFEService {
  constructor(client) {
    this.client = client;
    this.company = client.companyConfig;

    if (!this.company) {
      throw new Error(`La empresa '${client.company}' no existe.`);
    }

    this.wsdl = path.join(__dirname, "../wsdl/wsfe.wsdl");

    this.url = this.company.production
      ? constants.PRODUCCION.WSFE_URL
      : constants.HOMOLOGACION.WSFE_URL;

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

  async getLastVoucher(puntoVenta, tipoComprobante) {
    const auth = await this.client.login("wsfe");

    const client = await this.getSoapClient();

    const params = {
      Auth: {
        Token: auth.token,
        Sign: auth.sign,
        Cuit: auth.cuit,
      },
      PtoVta: puntoVenta,
      CbteTipo: tipoComprobante,
    };

    const [result] = await client.FECompUltimoAutorizadoAsync(params);

    const body = result?.FECompUltimoAutorizadoResult;

    // Cuando el tipo de comprobante nunca se emitió en ese punto de venta,
    // AFIP devuelve un error (p. ej. 602 "no se ha registrado ninguna
    // emisión") en lugar del CbteNro. En ese caso la numeración arranca
    // en 1, igual que si fuera el primer comprobante.
    if (!body || !Number.isFinite(Number(body.CbteNro)) || body.Errors || body.FEErr) {
      return { CbteNro: 0 };
    }

    return body;
  }

  async createInvoice(data) {
    const auth = await this.client.login("wsfe");
    const client = await this.getSoapClient();

    const last = await this.getLastVoucher(
      data.puntoVenta,
      data.tipoComprobante,
    );

    const nextNumber = Number(last?.CbteNro || 0) + 1;

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    const importeNeto = redondear(data.importeNeto);
    const importeIva = redondear(data.importeIva);
    const importeTotal = redondear(importeNeto + importeIva);

    const esNota = [3, 8, 13, 2, 7, 12].includes(Number(data.tipoComprobante));

    const cbteAsoc = Array.isArray(data.cbteAsoc)
      ? data.cbteAsoc
          .filter((x) => x && Number(x.numero) > 0)
          .map((x) => ({
            Tipo: Number(x.tipo),
            PtoVta: Number(x.puntoVenta),
            Nro: Number(x.numero),
          }))
      : null;

    const ivaAlicuotas = (data.iva || []).map((a) => ({
      Id: Number(a.Id),
      BaseImp: redondear(a.BaseImp),
      Importe: redondear(a.Importe),
    }));

    /*
     * RG 5616/2024: "Condición frente al IVA del receptor" es obligatorio.
     * Garantizamos que SIEMPRE viaje un código válido de la tabla de ARCA y
     * que además sea admitido por la clase del comprobante (error 4962).
     */
    const letra = getLetraComprobante(data.tipoComprobante);
    let condicionIvaReceptorId = Number(data.condicionIVAReceptorId);
    if (
      !Number.isInteger(condicionIvaReceptorId) ||
      !CONDICION_IVA_RECEPTOR_TABLA[condicionIvaReceptorId]
    ) {
      condicionIvaReceptorId = CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
    }
    condicionIvaReceptorId = condicionIvaReceptorParaClase(
      condicionIvaReceptorId,
      letra,
    );

    const params = {
      Auth: {
        Token: auth.token,
        Sign: auth.sign,
        Cuit: auth.cuit,
      },
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: data.puntoVenta,
          CbteTipo: data.tipoComprobante,
        },
        FeDetReq: {
          FECAEDetRequest: [
            {
              Concepto: data.concepto || 1,
              DocTipo: data.docTipo,
              DocNro: data.docNro,
              CbteDesde: nextNumber,
              CbteHasta: nextNumber,
              CbteFch: data.fecha || today,
              CondicionIVAReceptorId: condicionIvaReceptorId,
              ImpTotal: importeTotal,
              ImpTotConc: 0,
              ImpNeto: importeNeto,
              ImpOpEx: 0,
              ImpIVA: importeIva,
              ImpTrib: 0,
              MonId: data.moneda || "PES",
              MonCotiz: Number(data.cotizacion || 1),

              ...(esNota && cbteAsoc
                ? {
                    CbteAsoc: {
                      CbteAsocReq: cbteAsoc,
                    },
                  }
                : {}),

              ...(ivaAlicuotas.length > 0
                ? {
                    Iva: {
                      AlicIva: ivaAlicuotas,
                    },
                  }
                : {}),
            },
          ],
        },
      },
    };

    const [result] = await client.FECAESolicitarAsync(params);

    return this.formatInvoiceResponse(result.FECAESolicitarResult);
  }
  formatInvoiceResponse(result) {
    const det = result.FeDetResp.FECAEDetResponse[0];

    return {
      ok: det.Resultado === "A",
      resultado: det.Resultado,
      cae: det.CAE || null,
      vencimiento: det.CAEFchVto || null,
      numero: det.CbteDesde,
      observaciones: det.Observaciones || null,
      errores: result.Errors || null,
      raw: result,
    };
  }
}

module.exports = WSFEService;
