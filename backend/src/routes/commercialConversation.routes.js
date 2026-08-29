const express = require("express");

const Controller = require("../controllers/commercialConversation.controller");

/*
 * Rutas del nuevo flujo comercial conversacional.
 */
const router = express.Router();

/*
 * Recibe mensajes de WhatsApp, n8n, React o API.
 */
router.post("/message", Controller.message);

/*
 * Lista conversaciones recientes.
 */
router.get("/", Controller.list);

/*
 * Obtiene una conversación puntual.
 */
router.get("/:id", Controller.getById);

module.exports = router;
