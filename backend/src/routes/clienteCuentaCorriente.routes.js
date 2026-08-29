const express = require("express");
const router = express.Router();

const controller = require("../controllers/clienteCuentaCorriente.controller");
const requirePermission = require("../middleware/permission.middleware");

router.get(
  "/:clienteDoc/pendientes",
  requirePermission("clientes.cc.consultar"),
  controller.pendientes,
);

router.get(
  "/:clienteDoc",
  requirePermission("clientes.cc.consultar"),
  controller.consultar,
);

router.post(
  "/cobro",
  requirePermission("clientes.cc.cobrar"),
  controller.cobrar,
);
router.post(
  "/aplicar",
  requirePermission("clientes.cc.cobrar"),
  controller.aplicar,
);

module.exports = router;
