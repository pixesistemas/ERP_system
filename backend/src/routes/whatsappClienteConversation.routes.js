const express = require("express");

const controller = require("../controllers/whatsappClienteConversation.controller");

/*
 * Ruta que va a apuntar el flujo de n8n / WhatsApp Business para clientes
 * finales. Requiere apiKeyMiddleware + whatsappClienteAuth.middleware.js
 * montados antes (ver app.js), igual que el canal de operadores.
 */
const router = express.Router();

router.post("/message", controller.message);

module.exports = router;
