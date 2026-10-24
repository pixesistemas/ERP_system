const {
  ocrConfig,
  fechaIso,
  numeroImporte,
} = require("./ocrCompra.service");

const PROMPT = `Sos un asistente experto en comprobantes y listas de precios de proveedores de Argentina.
Leé el documento y devolvé SOLO un JSON válido, sin texto adicional, con esta forma:
{
  "proveedor_nombre": "",
  "proveedor_documento": "",
  "proveedor_condicion_iva": "RESPONSABLE INSCRIPTO|MONOTRIBUTO|EXENTO|CONSUMIDOR FINAL",
  "proveedor_domicilio": "",
  "tipo_comprobante": "FACTURA|NOTA DE CREDITO|NOTA DE DEBITO|REMITO|LISTA DE PRECIOS|OTRO",
  "letra": "A|B|C",
  "punto_venta": 0,
  "numero": "",
  "fecha": "YYYY-MM-DD",
  "fecha_vencimiento": "YYYY-MM-DD",
  "condicion_pago": "",
  "moneda": "PES",
  "costo_incluye_iva": false,
  "neto_gravado": 0,
  "exento_no_gravado": 0,
  "iva_total": 0,
  "percepciones": 0,
  "total": 0,
  "confianza": "ALTA|MEDIA|BAJA",
  "items": [
    {
      "codigo": "",
      "codigo_barra": "",
      "codigo_proveedor": "",
      "descripcion": "",
      "cantidad": 0,
      "unidad": "UN",
      "costo_unitario": 0,
      "descuento": 0,
      "iva": 21,
      "importe": 0,
      "confianza": "ALTA|MEDIA|BAJA",
      "revisar": false
    }
  ]
}
Reglas obligatorias:
- No inventes productos, cantidades ni precios. Si no se lee un dato, dejalo vacío ("" o 0) y poné "revisar": true en ese renglón.
- Copiá los códigos tal cual, conservando ceros a la izquierda y guiones.
- "cantidad" es la cantidad facturada/lista. "costo_unitario" es el precio unitario NETO sin IVA cuando el documento discrimina IVA.
- Si es factura C o el documento muestra un único precio final con IVA incluido, poné "costo_incluye_iva": true y usá ese precio final como costo_unitario.
- "descuento" es el porcentaje de descuento de la línea (0 si no hay). "iva" es la alícuota (21, 10.5, 27 o 0).
- "importe" es el total de la línea tal como figura; si no figura, calculalo con cantidad, costo, descuento e IVA.
- Devolvé todos los renglones visibles, en el mismo orden. No agregues renglones de subtotales, IVA, percepciones ni total.
- Los importes van sin separador de miles y con punto decimal.`;

function errorConEstado(mensaje, statusCode = 400) {
  const error = new Error(mensaje);
  error.statusCode = statusCode;
  return error;
}

function textoPlano(buffer) {
  return String(buffer || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function extraerTextoPdf(buffer) {
  let pdfParse;
  try {
    pdfParse = require("pdf-parse");
  } catch {
    throw errorConEstado(
      "El servidor no tiene soporte para leer PDF. Subí una foto JPG/PNG o instalá el soporte de PDF.",
      503,
    );
  }

  let resultado;
  try {
    resultado = await pdfParse(buffer);
  } catch (error) {
    throw errorConEstado(
      `No se pudo leer el PDF: ${error.message}. Probá subir una foto del comprobante.`,
      400,
    );
  }

  const texto = textoPlano(resultado?.text);
  if (texto.replace(/\s/g, "").length < 40) {
    throw errorConEstado(
      "El PDF no tiene texto seleccionable (parece escaneado). Subí una foto JPG/PNG del comprobante para usar el OCR.",
      400,
    );
  }
  return texto.slice(0, 120000);
}

function mimePermitido(mime, nombre) {
  const valor = String(mime || "").toLowerCase();
  const ext = String(nombre || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  if (valor === "application/pdf" || ext === ".pdf") return "application/pdf";
  if (["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(valor)) {
    return valor === "image/jpg" ? "image/jpeg" : valor;
  }
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  }
  return null;
}

function limpiarItem(raw, indice, cabecera) {
  const item = raw && typeof raw === "object" ? raw : {};
  const descripcion = String(item.descripcion || item.detalle || item.producto || "").trim();
  const codigo = String(item.codigo || item.codigo_articulo || "").trim();
  const codigoBarra = String(
    item.codigo_barra || item.codigoBarras || item.ean || "",
  ).trim();
  const codigoProveedor = String(
    item.codigo_proveedor || item.codigoProveedor || item.referencia || "",
  ).trim();
  const cantidad = numeroImporte(
    item.cantidad ?? item.cantidad_facturada ?? item.cantidadFacturada,
  );
  const costo = numeroImporte(
    item.costo_unitario ?? item.costoUnitario ?? item.precio_unitario ?? item.precio,
  );
  const descuento = numeroImporte(item.descuento ?? item.descuento_porcentaje);
  const iva = Number(item.iva ?? item.alicuota ?? (cabecera.costo_incluye_iva ? 21 : 21)) || 0;
  const unidad = String(item.unidad || "UN").trim().toUpperCase().slice(0, 12) || "UN";
  let importe = numeroImporte(item.importe ?? item.total ?? item.subtotal);
  if (!importe && cantidad > 0 && costo > 0) {
    const neto = cabecera.costo_incluye_iva ? costo / (1 + iva / 100) : costo;
    importe = neto * cantidad * (1 - descuento / 100) * (1 + iva / 100);
  }
  importe = Math.round(importe * 100) / 100;

  const revisar =
    item.revisar === true ||
    (!descripcion && !codigo && !codigoBarra) ||
    cantidad <= 0 ||
    costo <= 0;

  return {
    linea: indice + 1,
    codigo,
    codigo_barra: codigoBarra,
    codigo_proveedor: codigoProveedor,
    descripcion,
    cantidad_facturada: Math.max(0, cantidad),
    cantidad_recibida: Math.max(0, cantidad),
    unidad,
    costo_unitario: Math.max(0, costo),
    descuento: Math.max(0, descuento),
    iva,
    importe,
    confianza: String(item.confianza || "").trim().toUpperCase(),
    revisar,
  };
}

function normalizarResultado(datos, origen = "OCR") {
  const crudo = datos && typeof datos === "object" ? datos : {};
  const itemsCrudos = Array.isArray(crudo.items)
    ? crudo.items
    : Array.isArray(crudo.renglones)
      ? crudo.renglones
      : Array.isArray(crudo.detalles)
        ? crudo.detalles
        : Array.isArray(crudo.productos)
          ? crudo.productos
          : [];

  const cabecera = {
    proveedor_nombre: String(crudo.proveedor_nombre || crudo.proveedor || "").trim(),
    proveedor_documento: String(
      crudo.proveedor_documento || crudo.cuit || crudo.documento || "",
    ).replace(/[^\d]/g, ""),
    proveedor_condicion_iva: String(crudo.proveedor_condicion_iva || "")
      .trim()
      .toUpperCase(),
    proveedor_domicilio: String(crudo.proveedor_domicilio || crudo.domicilio || "").trim(),
    tipo_comprobante: String(crudo.tipo_comprobante || "").trim().toUpperCase(),
    letra: String(crudo.letra || "").trim().toUpperCase().slice(0, 1),
    punto_venta: Number(crudo.punto_venta || 0) || 0,
    numero: String(crudo.numero || crudo.numero_comprobante || "").trim(),
    fecha: fechaIso(crudo.fecha) || new Date().toISOString().slice(0, 10),
    fecha_vencimiento: fechaIso(crudo.fecha_vencimiento),
    condicion_pago: String(crudo.condicion_pago || "").trim(),
    moneda: String(crudo.moneda || "PES").trim().toUpperCase() || "PES",
    costo_incluye_iva: crudo.costo_incluye_iva === true,
    neto_gravado: numeroImporte(crudo.neto_gravado),
    exento_no_gravado: numeroImporte(crudo.exento_no_gravado),
    iva_total: numeroImporte(crudo.iva_total),
    percepciones: numeroImporte(crudo.percepciones),
    total: numeroImporte(crudo.total),
    confianza: String(crudo.confianza || "").trim().toUpperCase(),
    origen,
  };

  const items = itemsCrudos
    .slice(0, 500)
    .map((item, indice) => limpiarItem(item, indice, cabecera))
    .filter(
      (item) =>
        item.descripcion ||
        item.codigo ||
        item.codigo_barra ||
        item.cantidad_facturada > 0 ||
        item.costo_unitario > 0,
    );

  return {
    cabecera,
    items,
    faltantes: [
      !cabecera.proveedor_nombre && "proveedor",
      !cabecera.tipo_comprobante && "tipo de comprobante",
      !cabecera.numero && "número de comprobante",
      !cabecera.total && "total",
      !items.length && "renglones",
    ].filter(Boolean),
    requiere_revision:
      !items.length ||
      items.some((item) => item.revisar) ||
      ["BAJA", "MEDIA"].includes(cabecera.confianza),
  };
}

async function llamarOcr({ cfg, mime, buffer, textoPdf }) {
  const contenido = textoPdf
    ? [
        {
          type: "text",
          text: `${PROMPT}\n\nTexto extraído del PDF (podés corregir la lectura usando el texto):\n---\n${textoPdf}\n---`,
        },
      ]
    : [
        { type: "text", text: PROMPT },
        {
          type: "image_url",
          image_url: {
            url: `data:${mime};base64,${buffer.toString("base64")}`,
            detail: "high",
          },
        },
      ];

  let respuesta;
  try {
    respuesta = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(90000),
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: contenido }],
      }),
    });
  } catch (error) {
    throw errorConEstado(`No se pudo conectar con el OCR: ${error.message}`, 502);
  }

  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw errorConEstado(
      `El OCR respondió con error: ${json.error?.message || `HTTP ${respuesta.status}`}`,
      502,
    );
  }

  const contenidoRespuesta = String(json.choices?.[0]?.message?.content || "").trim();
  const limpio = contenidoRespuesta
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  const desde = limpio.indexOf("{");
  const hasta = limpio.lastIndexOf("}");
  const jsonTexto = desde >= 0 && hasta > desde ? limpio.slice(desde, hasta + 1) : limpio;

  try {
    return JSON.parse(jsonTexto);
  } catch {
    throw errorConEstado(
      "El OCR no devolvió datos legibles. Probá con una foto más nítida o cargá los renglones a mano.",
      502,
    );
  }
}

async function leerDocumento({ buffer, mime, nombre }) {
  const cfg = ocrConfig();
  if (!cfg) {
    throw errorConEstado(
      "El OCR no está configurado. Agregá OCR_API_KEY (u OPENAI_API_KEY) en el servidor o cargá la recepción a mano.",
      503,
    );
  }
  if (!buffer || !buffer.length) {
    throw errorConEstado("No se recibió el archivo del comprobante.");
  }

  const tipo = mimePermitido(mime, nombre);
  if (!tipo) {
    throw errorConEstado("Subí una imagen JPG/PNG/WEBP o un PDF.", 415);
  }

  const textoPdf = tipo === "application/pdf" ? await extraerTextoPdf(buffer) : "";
  const datos = await llamarOcr({ cfg, mime: tipo, buffer, textoPdf });
  return normalizarResultado(datos, "OCR");
}

module.exports = {
  leerDocumento,
  normalizarResultado,
  mimePermitido,
};
