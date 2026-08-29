const RulesEngine = require("../rules/rulesEngine");
const eventBus = require("../events/eventBus");
const EVENTS = require("../events/events.constants");

const {
  listarReglasActivasPorEvento,
} = require("../repositories/businessRule.repository");

function ejecutarReglas({ empresaId, evento, context }) {
  const reglas = listarReglasActivasPorEvento({
    empresaId,
    evento,
  });

  const resultados = [];

  for (const rule of reglas) {
    const cumple = RulesEngine.evaluate({
      rule,
      context,
    });

    if (cumple) {
      const resultado = RulesEngine.execute({
        rule,
        context,
      });

      eventBus.emitEvent(EVENTS.BUSINESS_RULE_TRIGGERED, {
        empresa: context.factura?.empresa || null,
        empresaId,
        rule,
        evento,
        resultado,
        context: {
          usuarioId: context.usuarioId || null,
          origen: context.origen || "api",
        },
      });

      if (resultado) {
        resultados.push(resultado);
      }
    }
  }

  return resultados;
}

module.exports = {
  ejecutarReglas,
};
