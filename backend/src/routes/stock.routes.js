const express = require("express");
const router = express.Router();

const controller = require("../controllers/stock.controller");
const requirePermission = require("../middleware/permission.middleware");

router.get("/", requirePermission("stock.consultar"), controller.listar);
router.get("/movimientos", requirePermission("stock.consultar"), controller.movimientos);

router.post(
  "/entrada",
  requirePermission("stock.gestionar"),
  controller.entrada,
);

router.post("/salida", requirePermission("stock.gestionar"), controller.salida);

module.exports = router;
