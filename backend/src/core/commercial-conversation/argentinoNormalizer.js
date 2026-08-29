/*
 * Normalizador de lenguaje argentino para pedidos por WhatsApp.
 *
 * Objetivo: entender las palabras coloquiales del diccionario del cliente
 * SIN consumir tokens de la IA. Las reglas viven en este módulo (cargado
 * una sola vez en memoria) y reescriben el mensaje antes de pasarlo al
 * parser clásico o a la IA. De esta forma la IA se llama menos y recibe
 * frases más limpias.
 *
 * No se inyecta el diccionario completo en el prompt de la IA: eso dispararía
 * el costo de tokens en cada mensaje. Acá solo se aplican las normalizaciones
 * seguras (tipos y sinónimos de acciones que el motor ya soporta).
 */

/*
 * Tipos frecuentes (sin ambigüedad comercial).
 * Se aplican sobre palabras completas para no romper nombres/prodescripciones.
 */
const TYPOS = [
  [/nesesito/gi, "necesito"],
  [/nececito/gi, "necesito"],
  [/presio/gi, "precio"],
  [/mercaderia/gi, "mercadería"],
  [/envio/gi, "envío"],
  [/direccion/gi, "dirección"],
  [/facturacion/gi, "facturación"],
  [/tranferencia/gi, "transferencia"],
  [/trasferencia/gi, "transferencia"],
  [/transferensia/gi, "transferencia"],
  [/efectibo/gi, "efectivo"],
  [/contaddo/gi, "contado"],
  [/cuenta corrinte/gi, "cuenta corriente"],
  [/cuenta coriente/gi, "cuenta corriente"],
  [/remitto/gi, "remito"],
  [/pedidio/gi, "pedido"],
  [/cantida\b/gi, "cantidad"],
  [/cantidd/gi, "cantidad"],
  [/prodcto/gi, "producto"],
  [/descueto/gi, "descuento"],
  [/estok/gi, "stock"],
  [/quilo\b/gi, "kilo"],
  [/quilos\b/gi, "kilos"],
  [/unid\b/gi, "unidad"],
  [/und\b/gi, "unidad"],
];

/*
 * Sinónimos de acción (solo los que no son polisémicos con cantidad/entrega).
 * "mandame" y "poneme" se dejan fuera a propósito: "poneme 5" significa
 * cambiar cantidad, no agregar; "mandalo a..." es entrega. La IA ya los
 * resuelve según contexto.
 */
const SINONIMOS = [
  // CANCELAR PEDIDO (tiene prioridad sobre los verbos genéricos de quitar)
  [/\bcancel[áa]me el pedido\b/gi, "cancelar pedido"],
  [/\banul[áa]me el pedido\b/gi, "cancelar pedido"],
  [/\bcancel[áa] el pedido\b/gi, "cancelar pedido"],
  [/\banul[áa] el pedido\b/gi, "cancelar pedido"],
  [/\bborr[áa] todo\b/gi, "cancelar pedido"],
  [/\bsac[áa] todo\b/gi, "cancelar pedido"],
  // AGREGAR
  [/\bagreg[áa]me\b/gi, "agregar"],
  [/\bagrega\b/gi, "agregar"],
  [/\bagreg[áa]\b/gi, "agregar"],
  [/\ba[ñn]ad[ií]me\b/gi, "agregar"],
  [/\ba[ñn]ad[ií]\b/gi, "agregar"],
  [/\bsum[áa]me\b/gi, "agregar"],
  [/\bsum[áa]\b/gi, "agregar"],
  [/\banot[áa]me\b/gi, "agregar"],
  [/\bcarg[áa]me\b/gi, "agregar"],
  [/\bcarg[áa]\b/gi, "agregar"],
  [/\bmet[ée]me\b/gi, "agregar"],
  [/\bmet[ée]\b/gi, "agregar"],
  [/\bincorpor[áa]me\b/gi, "agregar"],
  // QUITAR
  [/\bsac[áa]me\b/gi, "quitar"],
  [/\bsac[áa]\b/gi, "quitar"],
  [/\bsaca\b/gi, "quitar"],
  [/\bquit[áa]me\b/gi, "quitar"],
  [/\bquit[áa]\b/gi, "quitar"],
  [/\bborr[áa]\b/gi, "quitar"],
  [/\bborra\b/gi, "quitar"],
  [/\belimin[áa]\b/gi, "quitar"],
  [/\belimina\b/gi, "quitar"],
  // REEMPLAZAR
  [/\breemplaz[áa]me\b/gi, "reemplazar"],
  [/\breemplaz[áa]lo\b/gi, "reemplazar"],
  [/\breemplazala\b/gi, "reemplazar"],
  [/\breemplazalo\b/gi, "reemplazar"],
  [/\bsustitu[íi]me\b/gi, "reemplazar"],
  [/\bsustitu[íi]lo\b/gi, "reemplazar"],
  // NUEVO PEDIDO
  [/\bquiero hacer otro pedido\b/gi, "nuevo_pedido"],
  [/\barmar otro pedido\b/gi, "nuevo_pedido"],
  [/\barrancar de nuevo\b/gi, "nuevo_pedido"],
  [/\bempezar de cero\b/gi, "nuevo_pedido"],
  [/\botro pedido\b/gi, "nuevo_pedido"],
  [/\bnuevo pedido\b/gi, "nuevo_pedido"],
  // REPETIR ÚLTIMO
  [/\bhaceme lo mismo\b/gi, "repetir_ultimo"],
  [/\bhacer lo mismo\b/gi, "repetir_ultimo"],
  [/\blo mismo de siempre\b/gi, "repetir_ultimo"],
  [/\brepet[ií] el anterior\b/gi, "repetir_ultimo"],
  // AYUDA
  [/\bnecesito ayuda\b/gi, "ayuda"],
  [/\bhelp\b/gi, "ayuda"],
  [/\bayuda\b/gi, "ayuda"],
  // CONFIRMAR / CERRAR
  [/\bcierra\b/gi, "cerrar"],
  [/\bcerr[áa]lo\b/gi, "cerrar"],
  [/\bterminamos\b/gi, "cerrar"],
  [/\bde una\b/gi, "cerrar"],
  // OMITIR
  [/\bno lo cargues\b/gi, "omitir"],
  [/\bno lo pongas\b/gi, "omitir"],
  // CONSULTAR PRECIO
  [/\bcu[áa]nto sale\b/gi, "consultar_precio"],
  [/\bcu[áa]nto cuesta\b/gi, "consultar_precio"],
  [/\bcual es el precio\b/gi, "consultar_precio"],
  [/\bprecio de\b/gi, "consultar_precio"],
  // CONSULTAR STOCK
  [/\btiene[ns]? stock\b/gi, "consultar_stock"],
  [/\bhay stock\b/gi, "consultar_stock"],
  [/\bstock de\b/gi, "consultar_stock"],
  [/\bhaceme descuento\b/gi, "aplicar_descuento"],
  [/\baplic[áa]me descuento\b/gi, "aplicar_descuento"],
  [/\bdescuento del\b/gi, "aplicar_descuento"],
  [/\bdescuento de\b/gi, "aplicar_descuento"],
  // FACTURAR (solo empleados autorizados)
  [/\bfacturalo\b/gi, "facturar"],
  [/\bpasalo a factura\b/gi, "facturar"],
  [/\bemitir factura\b/gi, "facturar"],
  [/\bfactura esto\b/gi, "facturar"],
  [/\bfacturalo ya\b/gi, "facturar"],
  // NOTA DE CRÉDITO (solo empleados autorizados)
  [/\bnota de cr[ée]dito\b/gi, "nota_credito"],
  [/\bhaceme una nota de cr[ée]dito\b/gi, "nota_credito"],
  [/\bemitir nota de cr[ée]dito\b/gi, "nota_credito"],
  // RESERVAR STOCK (solo empleados autorizados)
  [/\breservame el stock\b/gi, "reservar_stock"],
  [/\breserv[áa] stock\b/gi, "reservar_stock"],
  [/\breservame stock\b/gi, "reservar_stock"],
  [/\bdejame reservado el stock\b/gi, "reservar_stock"],
];

function normalizar(texto) {
  if (!texto) return texto || "";
  let out = String(texto);
  for (const [regex, reemplazo] of TYPOS) {
    out = out.replace(regex, reemplazo);
  }
  for (const [regex, reemplazo] of SINONIMOS) {
    out = out.replace(regex, reemplazo);
  }
  return out;
}

module.exports = { normalizar, TYPOS, SINONIMOS };
