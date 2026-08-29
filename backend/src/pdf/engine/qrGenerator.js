const QRCode = require("qrcode");
const config = require("../../config/print.config");

class QRGenerator {
  async generateDataUrl({ request, response, factura }) {
    const fecha = new Date().toISOString().slice(0, 10);

    const data = {
      ver: 1,
      fecha,
      cuit: Number(factura.empresa.cuit),
      ptoVta: Number(request.puntoVenta),
      tipoCmp: Number(request.tipoComprobante),
      nroCmp: Number(response.numero),
      importe: Number(request.importeTotal),
      moneda: request.moneda || config.monedaPorDefecto,
      ctz: Number(request.cotizacion || config.cotizacionPorDefecto),
      tipoDocRec: Number(request.docTipo),
      nroDocRec: Number(request.docNro),
      tipoCodAut: "E",
      codAut: Number(response.cae),
    };

    const base64 = Buffer.from(JSON.stringify(data)).toString("base64");

    const url = `${config.baseQRUrl}?p=${base64}`;

    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 140,
    });
  }
}

module.exports = new QRGenerator();
