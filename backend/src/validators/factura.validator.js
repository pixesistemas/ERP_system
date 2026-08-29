const { isValidCUIT, isValidDNI } = require("../utils/validators");

function validateFacturaInput(data) {
  const errors = [];

  if (data.cliente?.cuit && !isValidCUIT(data.cliente.cuit)) {
    errors.push("CUIT del cliente inválido");
  }

  if (data.cliente?.dni && !isValidDNI(data.cliente.dni)) {
    errors.push("DNI del cliente inválido");
  }

  if (!data.cliente) {
    errors.push("Debe informar cliente");
  }

  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push("Debe informar al menos un item");
  }

  for (const [index, item] of (data.items || []).entries()) {
    if (!item.codigo && !item.descripcion) {
      errors.push(`Item ${index + 1}: debe informar código o descripción`);
    }

    if (item.cantidad != null && Number(item.cantidad) <= 0) {
      errors.push(`Item ${index + 1}: cantidad inválida`);
    }
  }

  if (errors.length > 0) {
    const error = new Error("Datos de factura inválidos");
    error.statusCode = 400;
    error.details = errors;
    throw error;
  }
}

module.exports = {
  validateFacturaInput,
};
