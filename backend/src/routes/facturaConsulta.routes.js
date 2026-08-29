const express = require("express");
const router = express.Router();

const controller = require("../controllers/facturaConsulta.controller");

router.get("/:id", controller.getFactura);

module.exports = router;
