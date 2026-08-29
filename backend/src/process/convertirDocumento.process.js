const {
  convertirDocumento,
} = require("../services/documentoConversion.service");

async function convertirDocumentoProcess(payload) {
  const documentoOrigenId = Number(payload.documentoOrigenId);
  const nuevoTipo = String(payload.nuevoTipo || "").toUpperCase();

  if (!documentoOrigenId) {
    const error = new Error("Debe informar documentoOrigenId");
    error.statusCode = 400;
    throw error;
  }

  if (!nuevoTipo) {
    const error = new Error("Debe informar nuevoTipo");
    error.statusCode = 400;
    throw error;
  }

  const documento = convertirDocumento({
    empresaId: payload.context?.empresaId,
    documentoOrigenId,
    nuevoTipo,
    subtipo: payload.subtipo || null,
  });

  return {
    documento,
  };
}

module.exports = convertirDocumentoProcess;
