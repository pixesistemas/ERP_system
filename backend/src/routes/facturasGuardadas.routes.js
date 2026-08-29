const express = require("express");
const router = express.Router();

const controller = require("../controllers/facturasGuardadas.controller");

router.get("/", controller.listarFacturas);

module.exports = router;
