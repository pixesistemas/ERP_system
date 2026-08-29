const express = require("express");
const router = express.Router();

const controller = require("../controllers/resolver.controller");

const requirePermission = require("../middleware/permission.middleware");

/*
 * Resuelve clientes.
 */
router.get(
  "/clientes",
  requirePermission("clientes.gestionar"),
  controller.cliente,
);

/*
 * Resuelve productos.
 */
router.get(
  "/productos",
  requirePermission("productos.gestionar"),
  controller.producto,
);

/*
 * Resuelve vendedores.
 */
router.get(
  "/vendedores",
  requirePermission("documentos.consultar"),
  controller.vendedor,
);

module.exports = router;
