/*
 * Capa opcional de IA compatible con APIs de chat completions.
 * Nunca ejecuta operaciones: solo normaliza el mensaje del usuario
 * y mejora el texto de respuesta. Toda acción sigue validándose
 * mediante el motor comercial existente.
 */
function enabled() {
  return String(process.env.AI_ENABLED || "false").toLowerCase() === "true" && Boolean(process.env.AI_API_KEY);
}

async function chat(messages, temperature = 0.15) {
  if (!enabled()) return null;
  const base = String(process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "gpt-4.1-mini",
      temperature,
      messages,
    }),
  });
  if (!response.ok) throw new Error(`Proveedor de IA respondió ${response.status}`);
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content?.trim() || null;
}

async function normalizeUserMessage({ message, state, command }) {
  if (!enabled()) return message;
  try {
    const content = await chat([
      {
        role: "system",
        content: `Sos un normalizador de órdenes comerciales argentinas. Interpretá el mensaje dentro de una conversación comercial continua. Convertílo a una instrucción breve que el parser pueda entender, sin inventar clientes, productos, cantidades ni precios. Si el usuario menciona solo una familia de producto como cemento, hierro o gaseosa, conservá ese texto para que el catálogo muestre coincidencias; no elijas una variante por tu cuenta. Entendé referencias como ese, el anterior, sumale, sacale, cambiá el cliente y confirmalo. Estado actual: ${state || "INICIO"}. Contexto JSON: ${JSON.stringify(command || {})}. Devolvé solo la instrucción normalizada, sin explicación. Preservá órdenes como confirmar, cancelar, omitir, reemplazar, agregar, quitar o cambiar cantidad.`,
      },
      { role: "user", content: String(message || "") },
    ]);
    return content || message;
  } catch (error) {
    console.warn("[AI] No se pudo normalizar el mensaje:", error.message);
    return message;
  }
}

async function naturalizeResponse({ message, state }) {
  if (!enabled() || !message) return message;
  try {
    const content = await chat([
      {
        role: "system",
        content: `Reescribí la respuesta de un asistente comercial argentino para que suene clara, amable y natural. No cambies importes, cantidades, nombres, estados ni instrucciones de confirmación. No agregues datos. Estado: ${state || ""}. Devolvé solo la respuesta final.`,
      },
      { role: "user", content: String(message) },
    ], 0.35);
    return content || message;
  } catch (error) {
    console.warn("[AI] No se pudo mejorar la respuesta:", error.message);
    return message;
  }
}

/*
 * Interpretador de pedidos: la IA convierte un mensaje libre en una
 * instrucción JSON que el motor comercial ejecuta. La IA NUNCA aporta
 * productos, precios, stock ni saldos: solo estructura lo que dijo el
 * cliente. Si no puede, devuelve null y el motor usa el parser por reglas.
 */
async function interpretarPedido({ message, contexto = {} }) {
  if (!enabled()) return null;

  const content = await chat([
    {
      role: "system",
      content: `Sos el intérprete de pedidos de una ferretería. El cliente manda WhatsApp y vos convertís el mensaje en una instrucción JSON para el motor de pedidos.

Devuelve SOLO JSON (sin texto extra, sin markdown):
{
  "intencion": "agregar|quitar|cambiar_cantidad|reemplazar|cerrar|resumen|saldo|direccion|repetir_ultimo|nuevo_pedido|cancelar|omitir|consultar_precio|consultar_stock|aplicar_descuento|facturar|nota_credito|reservar_stock|condicion_venta|ayuda|si|no",
  "items": [{"descripcion":"texto textual del producto","cantidad":5}],
  "descripcionOriginal":"...",
  "descripcionNueva":"...",
  "cantidad":10,
  "descuento":10,
  "direccion":"...",
  "factura":"0001-000123",
  "condicionVenta":"CUENTA_CORRIENTE",
  "textoOriginal":"el mensaje tal cual"
}

REGLAS:
- Nunca inventes productos, cantidades, precios ni direcciones. Copiá lo que dice el cliente (la búsqueda de catálogo la hace el ERP después).
- "mandame 10 bolsas de cemento y 5 cal" -> agregar, items: [{"descripcion":"bolsas de cemento","cantidad":10},{"descripcion":"cal","cantidad":5}]
- "sacá la cal" -> quitar items [{"descripcion":"cal","cantidad":0}] (cantidad 0 = todo el ítem); "sacá 2 de cal" -> quitar items [{"descripcion":"cal","cantidad":2}]
- "poneme 10 mejor" -> cambiar_cantidad {cantidad:10}; "cambiame la cal por cemento" -> reemplazar {descripcionOriginal:"cal",descripcionNueva:"cemento"}
- "cuánto llevo" -> resumen; "cuánto tengo de saldo" -> saldo; "mandalo a la obra de San Martín" -> direccion {direccion:"obra de San Martín"}
- "hacé lo mismo que el viernes" -> repetir_ultimo; "quiero hacer otro pedido" -> nuevo_pedido
- "cuánto sale el cemento" -> consultar_precio items [{"descripcion":"cemento"}]; "hay stock de cal" -> consultar_stock items [{"descripcion":"cal"}]
- "haceme 10% de descuento" -> aplicar_descuento {descuento:10}; "descuento del 5" -> aplicar_descuento {descuento:5}
- "facturalo" -> facturar; "emitir nota de credito" -> nota_credito; "reservame el stock" -> reservar_stock (estas solo las usa personal autorizado)
- "emitir nota de credito de la factura 0001-000123" -> nota_credito con factura:"0001-000123" (campo factura obligatorio si se conoce; si no, se usa la última factura autorizada del cliente)
- "ponelo en cuenta corriente" / "a cuenta corriente" / "en cta cte" -> intencion:"condicion_venta", condicionVenta:"CUENTA_CORRIENTE"
- "al contado" / "en efectivo" -> intencion:"condicion_venta", condicionVenta:"CONTADO"
- "cerralo / confirmar / dale" -> cerrar; "cancelá el pedido" -> cancelar; "sí" -> si; "no" -> no
- "más o menos el mismo pedido del viernes pero duplicá el cemento y no me mandes cal": intencion repetir_ultimo con ajustes: descripción en textoOriginal (el motor aplica los cambios).

Contexto de la conversación: ${JSON.stringify(contexto).slice(0, 1200)}`,
    },
    { role: "user", content: String(message || "") },
  ], 0);

  if (!content) return null;

  const json = content.replace(/```json|```/g, "").trim();
  const first = json.indexOf("{");
  const last = json.lastIndexOf("}");
  if (first === -1 || last === -1) return null;

  try {
    return JSON.parse(json.slice(first, last + 1));
  } catch (e) {
    console.warn("[AI] JSON inválido del intérprete:", e.message);
    return null;
  }
}

module.exports = { enabled, normalizeUserMessage, naturalizeResponse, interpretarPedido };
