const express = require("express");

const controller = require("../controllers/whatsappCommercialConversation.controller");

/*
 * Rutas del flujo conversacional
 * utilizado por WhatsApp y n8n.
 */
const router = express.Router();

/*
 * Procesa un mensaje comercial natural.
 */
router.post("/message", controller.message);

module.exports = router;
