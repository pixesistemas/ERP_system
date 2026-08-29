class TotalsRenderer {
  render({ request, ivaGrupos = [] }) {
    const tipo = Number(request.tipoComprobante);
    const discriminaIVA = [1, 2, 3].includes(tipo);

    const money = (v) =>
      Number(v || 0).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    if (discriminaIVA) {
      const grupos =
        Array.isArray(ivaGrupos) && ivaGrupos.length > 0
          ? ivaGrupos
          : [{ Id: 5, Importe: request.importeIva }];

      const ivaLines = grupos
        .map((grupo) => {
          const alicuota = this.alicuotaDe(grupo);
          return `
            <div class="totales-row"><span>IVA ${alicuota}</span><strong>$ ${money(grupo.Importe)}</strong></div>
          `;
        })
        .join("");

      return `
        <div class="totales-row"><span>NETO</span><strong>$ ${money(request.importeNeto)}</strong></div>
        ${ivaLines}
        <div class="totales-row total-final"><span>IMPORTE TOTAL:</span><strong>$ ${money(request.importeTotal)}</strong></div>
      `;
    }

    return `
      <div class="totales-row total-final">
        <span>IMPORTE TOTAL:</span>
        <strong>$ ${money(request.importeTotal)}</strong>
      </div>
    `;
  }

  alicuotaDe(grupo) {
    const id = Number(grupo.Id);
    const alicuotas = { 3: "0%", 4: "10.5%", 5: "21%", 6: "27%", 8: "5%", 9: "2.5%" };
    return alicuotas[id] || `${Number(grupo.alicuota || 21)}%`;
  }
}

module.exports = new TotalsRenderer();
