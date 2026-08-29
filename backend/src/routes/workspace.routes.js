const express = require("express");
const router = express.Router();

const controller = require("../controllers/workspace.controller");

const requirePermission = require("../middleware/permission.middleware");

// Crea un workspace comercial.
router.post("/", requirePermission("workspaces.gestionar"), controller.crear);

// Lista workspaces de la empresa.
router.get("/", requirePermission("workspaces.consultar"), controller.listar);

// Devuelve el resumen antes de confirmar.
router.get(
  "/:id/resumen",
  requirePermission("workspaces.consultar"),
  controller.resumen,
);

// Obtiene un workspace por ID.
router.get(
  "/:id",
  requirePermission("workspaces.consultar"),
  controller.obtener,
);

// Asigna un cliente al workspace.
router.patch(
  "/:id/cliente",
  requirePermission("workspaces.gestionar"),
  controller.asignarCliente,
);

// Agrega un artículo al workspace.
router.post(
  "/:id/items",
  requirePermission("workspaces.gestionar"),
  controller.agregarItem,
);

// Agrega un producto existente usando el motor de precios.
router.post(
  "/:id/productos",
  requirePermission("workspaces.gestionar"),
  controller.agregarProducto,
);

// Actualiza cantidad o descuento de un artículo.
router.patch(
  "/:id/items/:itemId",
  requirePermission("workspaces.gestionar"),
  controller.actualizarItem,
);

// Elimina un artículo del workspace.
router.delete(
  "/:id/items/:itemId",
  requirePermission("workspaces.gestionar"),
  controller.eliminarItem,
);
router.post(
  "/:id/confirmar",

  requirePermission("workspaces.confirmar"),

  controller.confirmar,
);

/*
 * Busca un cliente por texto y lo asigna
 * automáticamente cuando existe una única coincidencia.
 */
router.patch(
  "/:id/cliente-resolver",
  requirePermission("workspaces.gestionar"),
  controller.resolverCliente,
);

/*
 * Busca un producto por texto y lo agrega
 * automáticamente cuando existe una única coincidencia.
 */
router.post(
  "/:id/productos-resolver",
  requirePermission("workspaces.gestionar"),
  controller.resolverProducto,
);

module.exports = router;
