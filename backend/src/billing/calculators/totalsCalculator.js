const {
  RESPONSABILIDAD_IVA,
  IVA,
  normalizarCondicionIVA,
} = require("../../afip/fiscal.constants");

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getIvaId(porcentaje) {
  const p = Number(porcentaje);

  if (p === 0) return IVA.IVA_0;
  if (p === 10.5) return IVA.IVA_10_5;
  if (p === 21) return IVA.IVA_21;
  if (p === 27) return IVA.IVA_27;
  if (p === 5) return IVA.IVA_5;
  if (p === 2.5) return IVA.IVA_2_5;

  throw new Error(`Alícuota IVA no soportada: ${porcentaje}`);
}

function calculate(items, empresaIVA) {
  empresaIVA = normalizarCondicionIVA(empresaIVA);
  let importeNeto = 0;
  let importeIva = 0;
  let importeTotal = 0;

  const ivaGroups = {};
  const itemsCalculados = [];

  for (const item of items || []) {
    const cantidad = Number(item.cantidad || 1);
    const precioUnitario = Number(item.precioUnitario || 0);
    const descuentoPorcentaje = Number(item.descuento || 0);
    const ivaPorcentaje = Number(item.iva || 0);

    const bruto = round2(cantidad * precioUnitario);
    const descuentoImporte = round2((bruto * descuentoPorcentaje) / 100);
    const netoLinea = round2(bruto - descuentoImporte);

    const aplicaIva =
      empresaIVA === RESPONSABILIDAD_IVA.RESPONSABLE_INSCRIPTO &&
      ivaPorcentaje > 0;

    /*
     * Emisor que no discrimina IVA (Monotributo, no inscripto):
     * el precio de venta ya incluye el IVA y AFIP exige
     * ImpNeto = ImpTotal = precio final. El IVA no se muestra
     * por separado ni se declara en alícuotas.
     */
    const netoFiscal = aplicaIva
      ? netoLinea
      : ivaPorcentaje > 0
        ? round2(netoLinea * (1 + ivaPorcentaje / 100))
        : netoLinea;

    const ivaLinea = aplicaIva ? round2((netoLinea * ivaPorcentaje) / 100) : 0;

    const totalLinea = round2(netoFiscal + ivaLinea);

    importeNeto = round2(importeNeto + netoFiscal);
    importeIva = round2(importeIva + ivaLinea);
    importeTotal = round2(importeTotal + totalLinea);

    if (aplicaIva) {
      const ivaId = getIvaId(ivaPorcentaje);

      if (!ivaGroups[ivaId]) {
        ivaGroups[ivaId] = {
          Id: ivaId,
          BaseImp: 0,
          Importe: 0,
        };
      }

      ivaGroups[ivaId].BaseImp = round2(ivaGroups[ivaId].BaseImp + netoLinea);
      ivaGroups[ivaId].Importe = round2(ivaGroups[ivaId].Importe + ivaLinea);
    }

    itemsCalculados.push({
      ...item,
      cantidad,
      precioUnitario,
      descuentoPorcentaje,
      ivaPorcentaje,
      subtotal: netoFiscal,
      ivaImporte: ivaLinea,
      total: totalLinea,
    });
  }

  return {
    importeNeto,
    importeIva,
    importeTotal,
    iva: Object.values(ivaGroups),
    items: itemsCalculados,
  };
}

module.exports = {
  calculate,
  round2,
  getIvaId,
};
