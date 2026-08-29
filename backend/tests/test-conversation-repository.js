const Conversation = require("../src/core/conversation");

/*
 * Inicia o recupera una conversación activa.
 */
const conversation = Conversation.Engine.start({
  empresaId: 1,
  telefono: "5493450000000",
  canal: "WHATSAPP",
});

console.log("Conversación:", conversation.toPlainObject());

/*
 * Guarda un dato de contexto.
 */
const updated = Conversation.Engine.setContext({
  conversationId: conversation.id,
  key: "clienteTexto",
  value: "José",
});

console.log("Conversación actualizada:", updated.toPlainObject());
