const express = require("express");
const router = express.Router();

const controller = require("../controllers/conversation.controller");

const requirePermission = require("../middleware/permission.middleware");

/*
 * Inicia o recupera una conversación activa.
 */
router.post(
  "/start",
  requirePermission("conversations.gestionar"),
  controller.iniciar,
);

/*
 * Lista conversaciones de la empresa.
 */
router.get(
  "/",
  requirePermission("conversations.consultar"),
  controller.listar,
);

/*
 * Procesa un nuevo mensaje conversacional.
 */
router.post(
  "/message",
  requirePermission("conversations.gestionar"),
  controller.mensaje,
);

/*
 * Recupera una conversación por ID.
 */
router.get(
  "/:id",
  requirePermission("conversations.consultar"),
  controller.obtener,
);

/*
 * Actualiza un dato del contexto.
 */
router.patch(
  "/:id/context",
  requirePermission("conversations.gestionar"),
  controller.actualizarContexto,
);

/*
 * Cancela una conversación.
 */
router.post(
  "/:id/cancel",
  requirePermission("conversations.gestionar"),
  controller.cancelar,
);

/*
 * Finaliza una conversación.
 */
router.post(
  "/:id/finish",
  requirePermission("conversations.gestionar"),
  controller.finalizar,
);

module.exports = router;
