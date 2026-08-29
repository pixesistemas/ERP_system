const express = require("express");
const router = express.Router();

const controller = require("../controllers/eventStore.controller");
const requirePermission = require("../middleware/permission.middleware");

router.get("/", requirePermission("usuarios.gestionar"), controller.listar);

module.exports = router;
