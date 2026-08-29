const {
  facturarDocumento,
} = require("../services/documentoFacturacion.service");

async function facturarDocumentoProcess(payload) {
  const documentoId = Number(payload.documentoId);

  if (!documentoId) {
    const error = new Error("Debe informar documentoId");
    error.statusCode = 400;
    throw error;
  }

  return facturarDocumento({
    empresaId: payload.context?.empresaId,
    empresaNombre: payload.empresa,
    documentoId,
    condicionVenta: payload.condicionVenta || "CONTADO",
    context: payload.context || null,
  });
}

module.exports = facturarDocumentoProcess;
