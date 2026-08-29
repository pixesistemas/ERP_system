const db = require("../db/database");

function mapEmpresa(row) {
  if (!row) return null;

  return {
    id: row.id,
    nombre: row.nombre,
    razonSocial: row.razon_social || row.nombre,
    nombreFantasia: row.nombre_fantasia || row.nombre,

    cuit: row.cuit,
    condicionIVA: row.condicion_iva,
    puntoVenta: row.punto_venta,
    production: row.production === 1,

    direccion: row.direccion || "",
    localidad: row.localidad || "",
    provincia: row.provincia || "",
    codigoPostal: row.codigo_postal || "",

    telefono: row.telefono || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    web: row.web || "",

    ingresosBrutos: row.ingresos_brutos || row.cuit,
    inicioActividad: row.inicio_actividad || "",
    logo: row.logo || "",

    pieFactura: row.pie_factura || "",
    observaciones: row.observaciones || "",

    cert: row.cert_path,
    key: row.key_path,
    cache: row.cache_path || `storage/private/fiscal/cache/${row.nombre}`,
    activa: row.activa === 1,
    tema: row.tema || "lavanda",
  };
}

function getEmpresaByNombre(nombre) {
  const row = db
    .prepare("SELECT * FROM empresas WHERE nombre = ? AND activa = 1")
    .get(nombre) || db
    .prepare("SELECT * FROM empresas WHERE activa = 1 ORDER BY id LIMIT 1")
    .get();

  const empresa = mapEmpresa(row);

  if (!empresa) {
    throw new Error(`La empresa '${nombre}' no existe o está inactiva`);
  }

  return empresa;
}
function getEmpresaById(id) {
  const row = db
    .prepare("SELECT * FROM empresas WHERE id = ? AND activa = 1")
    .get(id);

  return mapEmpresa(row);
}
function getPlantillaComprobante(empresaId) {
  const row = db
    .prepare(
      "SELECT configuracion_json FROM comprobante_plantillas WHERE empresa_id = ? AND tipo = 'GENERAL'",
    )
    .get(empresaId);

  if (!row) return null;

  try {
    return JSON.parse(row.configuracion_json || "null");
  } catch {
    return null;
  }
}
function getEmpresaByApiKey(apiKey) {
  const row = db
    .prepare(
      `
      SELECT *
      FROM empresas
      WHERE api_key = ?
        AND api_key_activa = 1
        AND activa = 1
    `,
    )
    .get(apiKey);

  const empresa = mapEmpresa(row);

  if (!empresa) {
    return null;
  }

  return empresa;
}

module.exports = {
  getEmpresaByNombre,
  getEmpresaByApiKey,
  getEmpresaById,
  getPlantillaComprobante,
};
