const express = require("express");
const router = express.Router();

const controller = require("../controllers/rol.controller");
const requirePermission = require("../middleware/permission.middleware");

router.get("/", requirePermission("usuarios.gestionar"), controller.listar);
router.post("/", requirePermission("usuarios.gestionar"), controller.crear);
router.delete(
  "/:id",
  requirePermission("usuarios.gestionar"),
  controller.eliminar,
);
router.put(
  "/:id/pantallas",
  requirePermission("usuarios.gestionar"),
  controller.guardarPantallas,
);

module.exports = router;
