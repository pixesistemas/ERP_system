const assert = require("node:assert");

const CommercialConversation = require("../../src/core/commercial-conversation");

/*
 * Utiliza un teléfono distinto para evitar
 * interferir con conversaciones anteriores.
 */
const telefono = `549345${Date.now()}`;

/*
 * Crea el contexto comercial inicial.
 */
const context = CommercialConversation.Engine.start({
  message: "Haceme un presupuesto para José con 10 hierros contado",

  channel: "WHATSAPP",
});

/*
 * Persiste la conversación.
 */
const created = CommercialConversation.Service.create({
  empresaId: 1,

  telefono,

  canal: "WHATSAPP",

  context,
});

assert.ok(created.id, "La conversación debe tener ID.");

assert.strictEqual(created.context.command.operation, "PRESUPUESTO");

assert.strictEqual(created.context.command.customer.text, "José");

assert.strictEqual(created.context.command.products.length, 1);

/*
 * Cambia solamente el estado.
 *
 * No asigna un workspace ficticio porque workspace_id
 * tiene una clave foránea hacia la tabla workspaces.
 */
created.context.changeState("WAITING_CONFIRMATION");

const updated = CommercialConversation.Service.save(created);

assert.strictEqual(updated.context.workspaceId, null);

assert.strictEqual(updated.context.state, "WAITING_CONFIRMATION");

/*
 * Recupera nuevamente desde SQLite.
 */
const loaded = CommercialConversation.Service.findById({
  id: created.id,
  empresaId: 1,
});

assert.ok(loaded, "La conversación debe recuperarse.");

assert.strictEqual(loaded.context.command.operation, "PRESUPUESTO");

assert.strictEqual(loaded.context.command.customer.text, "José");

assert.strictEqual(loaded.context.command.products[0].quantity, 10);

assert.strictEqual(loaded.context.workspaceId, null);

assert.strictEqual(loaded.context.state, "WAITING_CONFIRMATION");

console.log("Commercial Conversation Persistence: test correcto.");
