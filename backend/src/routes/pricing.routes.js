const express = require("express");
const router = express.Router();

const controller = require("../controllers/pricing.controller");
const requirePermission = require("../middleware/permission.middleware");

router.post(
  "/listas",
  requirePermission("productos.gestionar"),
  controller.crearLista,
);

router.get(
  "/listas",
  requirePermission("productos.gestionar"),
  controller.listar,
);

router.post(
  "/listas/:nombre/precios",
  requirePermission("productos.gestionar"),
  controller.setPrecio,
);

router.get(
  "/listas/:nombre/items",
  requirePermission("productos.gestionar"),
  controller.items,
);
router.post(
  "/descuentos-cliente",
  requirePermission("productos.gestionar"),
  controller.setDescuento,
);

router.get(
  "/descuentos-cliente/:clienteDoc",
  requirePermission("productos.gestionar"),
  controller.descuentosCliente,
);

module.exports = router;
