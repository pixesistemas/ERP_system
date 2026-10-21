function limpiar(valor, max = 200) {
  return String(valor == null ? "" : valor).trim().slice(0, max);
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function fechaFox(fecha) {
  const d = new Date(fecha);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function sumarDias(fecha, dias) {
  return new Date(new Date(fecha).getTime() + dias * 86400000);
}

function mapearArticulo(fila) {
  const idart = Number(fila.idart);
  const codigo = limpiar(fila.codfabri, 100) || limpiar(fila.codprove, 100) || String(idart);
  return {
    idart,
    codigo,
    codbarra: limpiar(fila.codbarra, 150),
    descripcion: limpiar(fila.descrip, 300),
    detalle: limpiar(fila.detalle, 200),
    unidad: limpiar(fila.unidad, 100),
    stock: numero(fila.stock),
    iva: numero(fila.iva),
    pfinal1: numero(fila.pfinal1),
    pfinal2: numero(fila.pfinal2),
    pfinal3: numero(fila.pfinal3),
    pfinal4: numero(fila.pfinal4),
    idrubro: Number(fila.idrubro || 0),
    idmarca: Number(fila.idmarca || 0),
    actualizado_fox: limpiar(fila.fultact, 20),
  };
}

function mapearPresupuestoAFox(presupuesto, config = {}) {
  const items = Array.isArray(presupuesto.items) ? presupuesto.items : [];
  let neto = 0;
  let total = 0;
  const iva = { 21: 0, 10.5: 0, 27: 0, 5: 0, 2.5: 0 };
  const sub = { 21: 0, 10.5: 0, 27: 0 };
  let nogravado = 0;
  const detalle = [];

  for (const item of items) {
    const cantidad = numero(item.cantidad);
    const puni = numero(item.puni);
    const alicuota = numero(item.iva);
    const bruto = numero(puni * cantidad);
    const netoLinea = numero(bruto / (1 + alicuota / 100));
    const ivaLinea = numero(bruto - netoLinea);
    if (alicuota > 0) neto = numero(neto + netoLinea);
    total = numero(total + bruto);
    if (alicuota === 21) { iva[21] = numero(iva[21] + ivaLinea); sub[21] = numero(sub[21] + netoLinea); }
    else if (alicuota === 10.5) { iva[10.5] = numero(iva[10.5] + ivaLinea); sub[10.5] = numero(sub[10.5] + netoLinea); }
    else if (alicuota === 27) { iva[27] = numero(iva[27] + ivaLinea); sub[27] = numero(sub[27] + netoLinea); }
    else if (alicuota === 5) iva[5] = numero(iva[5] + ivaLinea);
    else if (alicuota === 2.5) iva[2.5] = numero(iva[2.5] + ivaLinea);
    if (alicuota === 0) nogravado = numero(nogravado + bruto);

    detalle.push({
      codigo: limpiar(item.codigo, 100),
      descripcion: limpiar(item.descripcion, 200),
      cant: cantidad,
      puni,
      descu: 0,
      iva: alicuota,
      ptotal: bruto,
      iva21: alicuota === 21 ? ivaLinea : 0,
      iva105: alicuota === 10.5 ? ivaLinea : 0,
      iva27: alicuota === 27 ? ivaLinea : 0,
      neto: alicuota > 0 ? netoLinea : 0,
      subtotal: bruto,
      idrubro: Number(item.idrubro || 0),
      idart: Number(item.idart || 0),
      subtotal21: alicuota === 21 ? netoLinea : 0,
      subtotal105: alicuota === 10.5 ? netoLinea : 0,
      subtotal27: alicuota === 27 ? netoLinea : 0,
      nogravado: alicuota > 0 ? 0 : bruto,
      unidadmed: limpiar(item.unidad, 100),
    });
  }

  const fecha = fechaFox(new Date());
  const fvenci = fechaFox(sumarDias(new Date(), 30));
  const vencimiento = sumarDias(new Date(), 30);
  const pv = Number(config.pv || 1);
  const nombreCliente = limpiar(presupuesto.cliente || "CONSUMIDOR FINAL", 150).toUpperCase();
  const observaciones = limpiar(presupuesto.observaciones, 150);

  const compro = {
    compro: limpiar(config.tipo || "PRESUPUESTO", 100),
    letra: limpiar(config.letra || "P", 10),
    pv,
    importe: total,
    det: "",
    varios: observaciones,
    fecha,
    fvenci,
    vencimiento: fechaFox(vencimiento),
    apnom: nombreCliente,
    dir: "",
    cuit: "0",
    tipo: "CONTADO",
    estado: config.estado || "",
    tipodoc: limpiar(config.tipodoc || "99", 30),
    escf: 1,
    tipoiva: "CONSUMIDOR FINAL",
    neto,
    subtotal: numero(neto + nogravado),
    iva21: iva[21],
    iva105: iva[10.5],
    iva27: iva[27],
    iva5: iva[5],
    iva25: iva[2.5],
    total,
    sub21: sub[21],
    sub105: sub[10.5],
    sub27: sub[27],
    nogravado,
    exento: 0,
    idvendedor: Number(config.idvendedor || 0),
    idmoneda: 1,
    moneda: "",
  };
  return { compro, items: detalle };
}

module.exports = { mapearArticulo, mapearPresupuestoAFox, fechaFox, sumarDias, numero, limpiar };
