const express = require("express");
const router = express.Router();

const controller = require("../controllers/comision.controller");
const requirePermission = require("../middleware/permission.middleware");

router.get("/", requirePermission("comisiones.consultar"), controller.listar);
router.post(
  "/liquidar",
  requirePermission("comisiones.liquidar"),
  controller.liquidar,
);

router.get(
  "/liquidaciones",
  requirePermission("comisiones.consultar"),
  controller.liquidaciones,
);

module.exports = router;
