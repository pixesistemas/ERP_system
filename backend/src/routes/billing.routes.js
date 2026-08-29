const express = require("express");
const router = express.Router();

const controller = require("../controllers/billing.controller");
const requirePermission = require("../middleware/permission.middleware");

router.post(
  "/factura",
  requirePermission("facturas.emitir"),
  controller.emitirFactura,
);

module.exports = router;
