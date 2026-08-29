/*
 * Punto único de entrada al módulo Conversation.
 */
module.exports = {
  Engine: require("./conversationEngine"),
  Service: require("./conversationService"),
  Repository: require("./conversation.repository"),
  States: require("./conversationStates"),
  Intents: require("./conversationIntents"),
  IntentDetector: require("./intentDetector"),
  MessageParser: require("./messageParser"),
};
