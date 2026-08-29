const express = require("express");
const router = express.Router();

const controller = require("../controllers/process.controller");
const requirePermission = require("../middleware/permission.middleware");

router.get("/", requirePermission("procesos.consultar"), controller.listar);

router.post(
  "/:proceso",
  requirePermission("procesos.ejecutar"),
  controller.ejecutar,
);

module.exports = router;
