const express = require("express");
const controller = require("../controllers/vendedorMovil.controller");
const jwtMiddleware = require("../middleware/jwt.middleware");
const requireVendedor = require("../middleware/vendedorAuth.middleware");

const router = express.Router();

router.post("/login", controller.login);
router.post("/refresh", controller.refresh);
router.post("/salir", controller.salir);

router.use(jwtMiddleware);
router.use(requireVendedor);

router.get("/bootstrap", controller.bootstrap);
router.get("/presupuestos", controller.listarPresupuestos);
router.get("/presupuestos/:id", controller.detallePresupuesto);
router.post("/presupuestos", controller.crearPresupuesto);

module.exports = router;
