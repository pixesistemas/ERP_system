const express = require("express");
const router = express.Router();

const controller = require("../controllers/businessSession.controller");

const requirePermission = require("../middleware/permission.middleware");

/*
 * Crea una sesión comercial.
 */
router.post("/", requirePermission("sessions.gestionar"), controller.crear);

/*
 * Lista sesiones de trabajo.
 */
router.get("/", requirePermission("sessions.consultar"), controller.listar);

/*
 * Devuelve el resumen de una sesión.
 */
router.get(
  "/:id/resumen",
  requirePermission("sessions.consultar"),
  controller.resumen,
);

/*
 * Obtiene una sesión por ID.
 */
router.get("/:id", requirePermission("sessions.consultar"), controller.obtener);

/*
 * Agrega un workspace a la sesión.
 */
router.post(
  "/:id/workspaces",
  requirePermission("sessions.gestionar"),
  controller.agregarWorkspace,
);

/*
 * Quita un workspace de la sesión.
 */
router.delete(
  "/:id/workspaces/:workspaceId",
  requirePermission("sessions.gestionar"),
  controller.quitarWorkspace,
);

/*
 * Cierra una sesión comercial.
 */
router.post(
  "/:id/cerrar",
  requirePermission("sessions.gestionar"),
  controller.cerrar,
);

module.exports = router;
