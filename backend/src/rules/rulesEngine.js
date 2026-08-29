class RulesEngine {
  evaluate({ rule, context }) {
    const condicion = JSON.parse(rule.condicion);

    if (condicion.tipo === "CLIENTE_DEUDA_MAYOR_A") {
      return Number(context.saldoCliente || 0) > Number(condicion.valor || 0);
    }

    if (condicion.tipo === "CLIENTE_DEUDA_MAS_FACTURA_MAYOR_A") {
      const deudaFinal =
        Number(context.saldoCliente || 0) + Number(context.importeFactura || 0);

      return deudaFinal > Number(condicion.valor || 0);
    }

    return false;
  }

  execute({ rule }) {
    const accion = JSON.parse(rule.accion);

    if (accion.tipo === "BLOQUEAR") {
      const error = new Error(
        accion.mensaje || "Operación bloqueada por regla de negocio",
      );
      error.statusCode = 400;
      throw error;
    }

    if (accion.tipo === "ADVERTIR") {
      return {
        tipo: "ADVERTENCIA",
        mensaje: accion.mensaje || "Advertencia de regla de negocio",
      };
    }

    return null;
  }
}

module.exports = new RulesEngine();
