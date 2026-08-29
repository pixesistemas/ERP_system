const express = require("express");

const router = express.Router();

const controller = require("../controllers/whatsappProcess.controller");

router.post("/:proceso", controller.ejecutar);

module.exports = router;
