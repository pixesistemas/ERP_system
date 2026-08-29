const CommercialCommand = require("./commercialCommand");

const EntityExtractor = require("./entityExtractor");

const Validator = require("./commercialCommandValidator");

/*
 * CommercialParser
 *
 * Convierte lenguaje natural en un CommercialCommand.
 *
 * No consulta la base ni ejecuta operaciones.
 */
class CommercialParser {
  /*
   * Interpreta un mensaje comercial completo.
   */
  parse({ message, channel = "API", validate = true } = {}) {
    const rawMessage = String(message || "").trim();

    const entities = EntityExtractor.extract(rawMessage);

    /*
     * Solo crea el objeto customer cuando realmente
     * se encontró un texto de cliente.
     */
    const customer = entities.customerText
      ? {
          id: null,
          text: entities.customerText,
        }
      : null;

    const command = new CommercialCommand({
      operation: entities.operation,

      customer,

      products: Array.isArray(entities.products) ? entities.products : [],

      payment: entities.payment,

      discount: entities.discount,

      sourceDocument: entities.sourceDocument,

      deliveryDate: entities.deliveryDate,

      rawMessage,

      channel,
    });

    /*
     * La validación se adjunta como metadato
     * sin modificar las entidades encontradas.
     */
    command.validation = validate ? Validator.validate(command) : null;

    return command;
  }
}

module.exports = new CommercialParser();
