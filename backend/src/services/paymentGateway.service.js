const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const db = require("../db/database");

/*
 * Pasarelas de pago. MVP: MercadoPago en modo "Cobros con QR" (QR dinámico).
 * El comercio tiene un QR fijo (pos_id) y el vendedor "activa un monto"; el
 * cliente escanea el mismo QR y ve el importe. La API de MP devuelve qr_data
 * (string) que se renderiza como imagen y se envía por WhatsApp.
 *
 * Sin credenciales (MERCADOPAGO_ACCESS_TOKEN / MERCADOPAGO_POS_ID) se usa un
 * mock para poder probar todo el flujo de extremo a extremo en dev.
 */

function obtenerPasarela(empresaId, proveedor) {
  const row = db
    .prepare(
      "SELECT * FROM pasarelas_pago WHERE empresa_id=? AND proveedor=? AND activo=1",
    )
    .get(empresaId, proveedor);
  if (!row) return null;
  let credenciales = {};
  try {
    credenciales = JSON.parse(row.credenciales || "{}");
  } catch (_) {
    credenciales = {};
  }
  return { ...row, credenciales };
}

async function crearCobro({
  empresaId,
  cliente,
  importe,
  documentoRef,
  proveedor = "MERCADOPAGO",
}) {
  const pasarela = obtenerPasarela(empresaId, proveedor);
  const token =
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    (pasarela && pasarela.credenciales.access_token);
  const posId =
    process.env.MERCADOPAGO_POS_ID ||
    (pasarela && pasarela.credenciales.pos_id);

  if (!token || !posId) {
    return mockCobro({ empresaId, importe, documentoRef });
  }

  const res = await fetch(
    "https://api.mercadopago.com/mpmobile/instore/qr/v1/payments",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(importe),
        external_reference: String(documentoRef || ""),
        notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || null,
        pos_id: String(posId),
      }),
    },
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err = new Error(
      `MercadoPago rechazó el cobro: ${res.status} ${txt}`,
    );
    err.statusCode = 502;
    throw err;
  }

  const data = await res.json();
  return {
    proveedor,
    qrData: data.qr_data || data.qrData || "",
    externalId: data.external_reference || String(documentoRef),
    url: null,
  };
}

async function mockCobro({ empresaId, importe, documentoRef }) {
  const qrData = `mock://mercadopago/cobro?importe=${encodeURIComponent(
    importe,
  )}&ref=${encodeURIComponent(documentoRef || "")}&empresa=${empresaId}`;
  return {
    proveedor: "MERCADOPAGO",
    qrData,
    externalId: String(documentoRef || ""),
    url: null,
    mock: true,
  };
}

async function generarImagenQR(qrData, empresaId, documentoRef) {
  const directory = path.join(process.cwd(), "storage", "cobros");
  fs.mkdirSync(directory, { recursive: true });
  const fileName = `cobro-${empresaId}-${
    documentoRef || Date.now()
  }.png`;
  const filePath = path.join(directory, fileName);
  await QRCode.toFile(filePath, qrData, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
  return {
    fileName,
    filePath,
    url: `/storage/cobros/${fileName}`,
    mimeType: "image/png",
  };
}

module.exports = { crearCobro, obtenerPasarela, generarImagenQR };
