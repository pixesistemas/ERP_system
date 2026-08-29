const express = require("express");
const router = express.Router();

const controller = require("../controllers/stockReserva.controller");
const requirePermission = require("../middleware/permission.middleware");

router.post("/", requirePermission("stock.reservar"), controller.crear);

router.get("/", requirePermission("stock.consultar"), controller.listar);

router.post(
  "/:id/cancelar",
  requirePermission("stock.reservar"),
  controller.cancelar,
);

router.post(
  "/:id/consumir",
  requirePermission("stock.reservar"),
  controller.consumir,
);

module.exports = router;
