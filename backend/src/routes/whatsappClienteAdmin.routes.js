const express = require("express");
const router = express.Router();

const controller = require("../controllers/whatsappClienteAdmin.controller");
const requirePermission = require("../middleware/permission.middleware");

router.get("/", requirePermission("clientes.gestionar"), controller.listar);
router.post(
  "/:id/aprobar",
  requirePermission("clientes.gestionar"),
  controller.aprobar,
);
router.post(
  "/:id/rechazar",
  requirePermission("clientes.gestionar"),
  controller.rechazar,
);
router.post(
  "/:id/reactivar",
  requirePermission("clientes.gestionar"),
  controller.reactivar,
);

module.exports = router;
