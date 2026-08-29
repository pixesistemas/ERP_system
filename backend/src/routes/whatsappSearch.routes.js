const express = require("express");

const router = express.Router();

const controller = require("../controllers/whatsappSearch.controller");

router.get("/clientes", controller.clientes);

router.get("/productos", controller.productos);

module.exports = router;
