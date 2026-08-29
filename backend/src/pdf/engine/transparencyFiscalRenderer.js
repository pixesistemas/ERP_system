class TransparencyFiscalRenderer {
  render({ request, factura }) {
    const tipo = Number(request.tipoComprobante);
    const esB = [6, 7, 8].includes(tipo);
    const consumidorFinal = factura.cliente.condicionIVA === "CF";

    if (!esB || !consumidorFinal) return "";

    const ivaContenido = Number(request.importeIva || 0);

    const money = ivaContenido.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return `
      <div class="transparencia">
        <strong>Regimen de Transparencia Fiscal a Consumidor Ley 27.743</strong><br/>
        <strong>IVA Contenido: $ ${money}</strong>
      </div>
    `;
  }
}

module.exports = new TransparencyFiscalRenderer();
