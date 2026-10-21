const express = require("express");
const controller = require("../controllers/vendedorMovil.controller");
const vendedorAuth = require("../middleware/vendedorAuth.middleware");

const router = express.Router();

router.post("/acceso", controller.acceso);
router.post("/salir", controller.salir);

router.use(vendedorAuth);
router.get("/bootstrap", controller.bootstrap);
router.get("/presupuestos", controller.listarPresupuestos);
router.get("/presupuestos/:id", controller.detallePresupuesto);
router.post("/presupuestos", controller.crearPresupuesto);

module.exports = router;
