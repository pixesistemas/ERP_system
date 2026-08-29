const {
  TRANSICIONES_DOCUMENTOS,
  TRANSICIONES_ESTADOS,
} = require("./workflow.constants");

class WorkflowEngine {
  canConvert(origen, destino) {
    return (TRANSICIONES_DOCUMENTOS[origen] || []).includes(destino);
  }

  validateConversion(origen, destino) {
    if (!this.canConvert(origen, destino)) {
      const error = new Error(`No se puede convertir ${origen} a ${destino}`);
      error.statusCode = 400;
      throw error;
    }
  }

  canChangeEstado(tipoDocumento, estadoActual, nuevoEstado) {
    return (TRANSICIONES_ESTADOS[tipoDocumento]?.[estadoActual] || []).includes(
      nuevoEstado,
    );
  }

  validateEstado(tipoDocumento, estadoActual, nuevoEstado) {
    if (!this.canChangeEstado(tipoDocumento, estadoActual, nuevoEstado)) {
      const error = new Error(
        `No se puede cambiar ${tipoDocumento} de ${estadoActual} a ${nuevoEstado}`,
      );
      error.statusCode = 400;
      throw error;
    }
  }
}

module.exports = new WorkflowEngine();
