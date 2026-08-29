const express = require("express");
const router = express.Router();

const facturasController = require("../controllers/facturas.controller");

router.post("/", facturasController.crearFactura);

module.exports = router;
