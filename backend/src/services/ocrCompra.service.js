/*
 * OCR de facturas de compra.
 *
 * Recibe la foto (buffer) y devuelve los datos leídos como JSON para que
 * el usuario los revise y confirme. Lo usan la pantalla de Compras del
 * ERP, la app móvil de compras y el canal de WhatsApp.
 *
 * Variables de entorno:
 *   OCR_API_KEY   (obligatoria; si falta se puede usar OPENAI_API_KEY)
 *   OCR_BASE_URL  (por defecto https://api.openai.com/v1)
 *   OCR_MODEL     (por defecto gpt-4o-mini)
 */

function ocrConfig() {
  const apiKey = process.env.OCR_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;
  return {
    apiKey,
    base: String(process.env.OCR_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: String(process.env.OCR_MODEL || "gpt-4o-mini"),
  };
}

const OCR_PROMPT = `Sos un asistente que lee facturas de compra argentinas (ARCA/AFIP) desde una foto.
Devolvé SOLO un JSON válido, sin explicaciones, con esta forma exacta:
{
  "proveedor_nombre": "",
  "proveedor_documento": "",
  "proveedor_condicion_iva": "RESPONSABLE INSCRIPTO|MONOTRIBUTO|EXENTO|CONSUMIDOR FINAL",
  "proveedor_domicilio": "",
  "tipo_comprobante": "FACTURA|NOTA DE CREDITO|NOTA DE DEBITO|RECIBO",
  "letra": "A|B|C",
  "punto_venta": 0,
  "numero": "",
  "fecha": "YYYY-MM-DD",
  "fecha_vencimiento": "YYYY-MM-DD o vacío",
  "neto_gravado": 0,
  "exento_no_gravado": 0,
  "iva_total": 0,
  "percepciones": 0,
  "total": 0,
  "iva_detalles": [ { "alicuota": 21, "neto": 0, "iva": 0 } ],
  "confianza": "ALTA|MEDIA|BAJA"
}
Reglas: los importes van sin puntos de miles y con punto decimal (ej: 21780.5). Si un dato no se lee, dejalo vacío o en 0. En comprobantes letra C el IVA está incluido en el total: poné neto_gravado = total, iva_total = 0 y una sola alícuota estimada en iva_detalles con el total como neto.`;

function fechaIso(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, "0");
    const d = String(valor.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const texto = String(valor).trim();
  const ar = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ar) return `${ar[3]}-${ar[2].padStart(2, "0")}-${ar[1].padStart(2, "0")}`;
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

const numeroImporte = (v) =>
  Number(
    String(v ?? 0)
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}\b)/g, "")
      .replace(",", "."),
  ) || 0;

/*
 * Procesa una imagen (buffer) y devuelve los datos normalizados.
 * Lanza Error con mensaje claro si el OCR no está configurado o falla.
 */
async function leerFactura(buffer, mime = "image/jpeg") {
  const cfg = ocrConfig();
  if (!cfg) {
    throw new Error(
      "El OCR no está configurado. Agregá OCR_API_KEY (por ejemplo de OpenAI) en el servidor para leer facturas por foto.",
    );
  }
  if (!buffer || !buffer.length) {
    throw new Error("No se recibió la foto de la factura.");
  }
  if (!String(mime).startsWith("image/")) {
    throw new Error("El archivo tiene que ser una imagen (JPG o PNG).");
  }

  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

  let respuesta;
  try {
    respuesta = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    throw new Error(`No se pudo conectar con el OCR: ${err.message}`);
  }

  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error(
      `El OCR respondió con error: ${json.error?.message || `HTTP ${respuesta.status}`}`,
    );
  }

  const contenido = String(json.choices?.[0]?.message?.content || "").trim();
  const limpio = contenido.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let datos;
  try {
    datos = JSON.parse(limpio);
  } catch {
    throw new Error("El OCR no devolvió datos legibles. Probá con una foto más nítida.");
  }

  const detalles = Array.isArray(datos.iva_detalles)
    ? datos.iva_detalles
        .map((d) => ({
          alicuota: Number(d.alicuota || 0),
          neto: numeroImporte(d.neto),
          iva: numeroImporte(d.iva),
        }))
        .filter((d) => d.neto > 0 || d.iva > 0)
    : [];

  return {
    proveedor_nombre: String(datos.proveedor_nombre || "").trim(),
    proveedor_documento: String(datos.proveedor_documento || "").replace(/[^\d]/g, ""),
    proveedor_condicion_iva: String(datos.proveedor_condicion_iva || "").trim().toUpperCase(),
    proveedor_domicilio: String(datos.proveedor_domicilio || "").trim(),
    tipo_comprobante: String(datos.tipo_comprobante || "FACTURA").trim().toUpperCase(),
    letra: String(datos.letra || "").trim().toUpperCase().slice(0, 1),
    punto_venta: Number(datos.punto_venta || 1) || 1,
    numero: String(datos.numero || "").trim(),
    fecha: fechaIso(datos.fecha) || new Date().toISOString().slice(0, 10),
    fecha_vencimiento: fechaIso(datos.fecha_vencimiento) || null,
    neto_gravado: numeroImporte(datos.neto_gravado),
    exento_no_gravado: numeroImporte(datos.exento_no_gravado),
    iva_total: numeroImporte(datos.iva_total),
    percepciones: numeroImporte(datos.percepciones),
    total: numeroImporte(datos.total),
    iva_detalles: detalles,
    confianza: String(datos.confianza || "").trim().toUpperCase(),
  };
}

module.exports = { leerFactura, ocrConfig, fechaIso, numeroImporte };
