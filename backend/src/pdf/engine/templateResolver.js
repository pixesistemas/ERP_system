const fs = require("fs");
const path = require("path");

class TemplateResolver {
  resolve({ empresaNombre, tipoComprobante }) {
    const templateName = this.getTemplateName(tipoComprobante);

    const empresaTemplate = path.join(
      process.cwd(),
      "src",
      "pdf",
      "templates",
      empresaNombre,
      templateName,
    );

    if (fs.existsSync(empresaTemplate)) {
      return empresaTemplate;
    }

    return path.join(
      process.cwd(),
      "src",
      "pdf",
      "templates",
      "default",
      templateName,
    );
  }

  getTemplateName(tipoComprobante) {
    const tipo = Number(tipoComprobante);

    const templates = {
      1: "facturaA.html",
      2: "notaDebitoA.html",
      3: "notaCreditoA.html",

      6: "facturaB.html",
      7: "notaDebitoB.html",
      8: "notaCreditoB.html",

      11: "facturaC.html",
      12: "notaDebitoC.html",
      13: "notaCreditoC.html",
    };

    return templates[tipo] || "factura.html";
  }
}

module.exports = new TemplateResolver();
