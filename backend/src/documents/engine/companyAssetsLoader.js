const fs = require("fs");
const path = require("path");

const db = require("../../db/database");

class CompanyAssetsLoader {
  /*
   * Carga el logo de la empresa. Si se pasa { puntoVenta }, primero busca
   * el logo propio del punto de venta (columna logo de puntos_venta) y
   * recién si no existe usa el logo general de la empresa, para que cada
   * boca de venta imprima sus comprobantes con su propia imagen.
   */
  load(empresa, extra = {}) {
    const logoBase64 =
      this.getLogoPuntoVenta(empresa, extra.puntoVenta) ||
      this.getLogoBase64(empresa);

    return {
      logoBase64,
      logoHtml: logoBase64 ? `<img class="logo" src="${logoBase64}" />` : "",
    };
  }

  getLogoPuntoVenta(empresa, puntoVenta) {
    const numero = Number(puntoVenta);

    if (!numero || !empresa?.id) {
      return null;
    }

    const row = db
      .prepare(
        "SELECT logo FROM puntos_venta WHERE empresa_id=? AND numero=? AND logo IS NOT NULL",
      )
      .get(empresa.id, numero);

    if (!row || !String(row.logo || "").startsWith("data:image/")) {
      return null;
    }

    return row.logo;
  }

  getLogoBase64(empresa) {
    const logoFile = empresa.logo || "logo.png";

    const logoPath = path.join(
      process.cwd(),
      "storage",
      "empresas",
      empresa.nombre,
      logoFile,
    );

    if (!fs.existsSync(logoPath)) {
      return null;
    }

    const ext = path.extname(logoPath).toLowerCase();

    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    const buffer = fs.readFileSync(logoPath);

    return `data:${mime};base64,${buffer.toString("base64")}`;
  }
}

module.exports = new CompanyAssetsLoader();
