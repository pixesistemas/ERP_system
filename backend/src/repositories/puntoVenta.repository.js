const db = require("../db/database");

/*
 * Punto de venta para la impresión de comprobantes.
 *
 * Cada punto de venta puede llevar su propia identidad comercial
 * (nombre de fantasía, dirección, teléfono, WhatsApp y mail). Cuando
 * esos datos están cargados se imprimen en el encabezado del
 * comprobante; los datos fiscales (CUIT, condición IVA, ingresos
 * brutos) siempre salen de la empresa.
 */
function obtenerPuntoVenta({ empresaId, numero }) {
  const id = Number(empresaId);
  const nro = Number(numero);

  if (!id || !nro) return null;

  return (
    db
      .prepare("SELECT * FROM puntos_venta WHERE empresa_id=? AND numero=?")
      .get(id, nro) || null
  );
}

function empresaConPuntoVenta(empresa, numero) {
  if (!empresa) return empresa;

  const puntoVenta = obtenerPuntoVenta({
    empresaId: empresa.id,
    numero,
  });

  if (!puntoVenta) return empresa;

  const texto = (valor) => String(valor || "").trim();
  const fantasia = texto(puntoVenta.nombre_fantasia);
  const direccion = texto(puntoVenta.direccion);

  return {
    ...empresa,

    nombreFantasia: fantasia || empresa.nombreFantasia,
    razonSocial: fantasia || empresa.razonSocial,

    direccion: direccion || empresa.direccion,
    localidad: direccion ? "" : empresa.localidad,
    provincia: direccion ? "" : empresa.provincia,
    codigoPostal: direccion ? "" : empresa.codigoPostal,

    telefono: texto(puntoVenta.telefono) || empresa.telefono,
    whatsapp: texto(puntoVenta.whatsapp) || empresa.whatsapp,
    email: texto(puntoVenta.email) || empresa.email,
  };
}

module.exports = { obtenerPuntoVenta, empresaConPuntoVenta };
