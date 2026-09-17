const express = require("express");
const router = express.Router();

const controller = require("../controllers/usuario.controller");
const requirePermission = require("../middleware/permission.middleware");

router.post("/", requirePermission("usuarios.gestionar"), controller.crear);
router.get("/", requirePermission("usuarios.gestionar"), controller.listar);

router.patch(
  "/:id/activo",
  requirePermission("usuarios.gestionar"),
  controller.activarDesactivar,
);

router.patch(
  "/:id/rol",
  requirePermission("usuarios.gestionar"),
  controller.cambiarRol,
);

router.get(
  "/:id/puntos-venta",
  requirePermission("usuarios.gestionar"),
  controller.listarPuntosVenta,
);

router.put(
  "/:id/puntos-venta",
  requirePermission("usuarios.gestionar"),
  controller.guardarPuntosVenta,
);

router.get(
  "/:id/cajas",
  requirePermission("usuarios.gestionar"),
  controller.listarCajas,
);

router.put(
  "/:id/cajas",
  requirePermission("usuarios.gestionar"),
  controller.guardarCajas,
);

module.exports = router;
