const db = require("../src/db/database");
const { guardarPasarela, guardarLink } = require("../src/repositories/paymentLink.repository");
const { crearCobro, generarImagenQR } = require("../src/services/paymentGateway.service");

/*
 * Deja la empresa demo lista para mostrar el cobro con MercadoPago
 * (modo demo: QR real pero sin credenciales, o con credenciales si están
 * configuradas). Es idempotente: se puede correr cuántas veces se quiera.
 *
 * Uso: npm run db:seed:demo-pagos   (dentro de backend)
 */
async function main() {
  const empresa = db
    .prepare(
      "SELECT id, nombre FROM empresas WHERE activa=1 ORDER BY id LIMIT 1",
    )
    .get();
  if (!empresa) {
    console.log("No hay una empresa activa para configurar.");
    return;
  }

  // Asegura la pasarela MercadoPago activa para la empresa demo.
  guardarPasarela({
    empresaId: empresa.id,
    proveedor: "MERCADOPAGO",
    nombre: "MercadoPago (demo)",
    activo: 1,
    credenciales: {
      access_token: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
      pos_id: process.env.MERCADOPAGO_POS_ID || "",
    },
    config: { modo: "QR_DINAMICO" },
  });
  console.log(`Pasarela MERCADOPAGO activa para empresa ${empresa.id} (${empresa.nombre}).`);

  // Elige un cliente demo (o crea uno de muestra).
  let cliente = db
    .prepare("SELECT id, razon_social FROM clientes WHERE empresa_id=? ORDER BY id LIMIT 1")
    .get(empresa.id);
  if (!cliente) {
    const info = db
      .prepare("INSERT INTO clientes (empresa_id, razon_social, condicion_iva) VALUES (?,?,?)")
      .run(empresa.id, "Cliente Demo", "CONSUMIDOR_FINAL");
    cliente = { id: info.lastInsertRowid, razon_social: "Cliente Demo" };
  }

  const importe = 128792.56;
  const documentoRef = `demo-${empresa.id}-${cliente.id}`;

  const cobro = await crearCobro({
    empresaId: empresa.id,
    cliente: { id: cliente.id },
    importe,
    documentoRef,
  });
  const imagen = await generarImagenQR(cobro.qrData, empresa.id, documentoRef);
  const link = guardarLink({
    empresaId: empresa.id,
    clienteId: cliente.id,
    documentoId: null,
    proveedor: cobro.proveedor,
    importe,
    url: cobro.url,
    qrData: cobro.qrData,
    externalId: cobro.externalId,
    estado: "PENDIENTE",
  });

  console.log("======================================================");
  console.log("Cobro demo listo para mostrar");
  console.log("  Empresa:", empresa.nombre);
  console.log("  Cliente:", cliente.razon_social);
  console.log("  Importe: $", importe.toLocaleString("es-AR", { minimumFractionDigits: 2 }));
  console.log(`  QR: ${imageUrl(imagen.url)}`);
  console.log("  Link id:", link.id, "- estado:", link.estado, cobro.mock ? "(modo demo)" : "");
  console.log("======================================================");
}

function imageUrl(url) {
  const base = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return base ? `${base}${url}` : url;
}

main().catch((e) => {
  console.error("Error seed demo pagos:", e.message);
  process.exit(1);
});
