const express = require("express");
const router = express.Router();

const controller = require("../controllers/businessRule.controller");
const requirePermission = require("../middleware/permission.middleware");

router.post("/", requirePermission("usuarios.gestionar"), controller.crear);

router.get(
  "/evento/:evento",
  requirePermission("usuarios.gestionar"),
  controller.listarPorEvento,
);

module.exports = router;
