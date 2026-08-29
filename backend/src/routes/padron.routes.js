const express = require("express");
const router = express.Router();

const padronController = require("../controllers/padron.controller");

router.get("/:cuit", padronController.consultarPersona);

module.exports = router;
