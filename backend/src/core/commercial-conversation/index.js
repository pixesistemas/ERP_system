/*
 * Punto único de entrada al módulo
 * Commercial Conversation.
 */
module.exports = {
  Engine: require("./commercialConversationEngine"),

  Context: require("./commercialCommandContext"),

  States: require("./commercialConversationStates"),

  ResponseBuilder: require("./commercialConversationResponseBuilder"),

  Repository: require("./commercialConversationRepository"),

  Service: require("./commercialConversationService"),
};
