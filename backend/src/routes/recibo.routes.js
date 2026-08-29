const express = require("express");
const router = express.Router();

const controller = require("../controllers/recibo.controller");
const requirePermission = require("../middleware/permission.middleware");

router.post("/", requirePermission("recibos.crear"), controller.crear);
router.get("/", requirePermission("recibos.consultar"), controller.listar);
router.get("/:id/pdf", requirePermission("recibos.consultar"), controller.pdf);
router.get("/:id", requirePermission("recibos.consultar"), controller.obtener);
router.post(
  "/:id/confirmar",
  requirePermission("recibos.confirmar"),
  controller.confirmar,
);

module.exports = router;
