const express = require("express");
const router = express.Router();

const controller = require("../controllers/recepcion.controller");
const requirePermission = require("../middleware/permission.middleware");

router.get("/", requirePermission("recepcion.gestionar"), controller.listar);
router.get("/depositos", requirePermission("recepcion.gestionar"), controller.depositos);
router.get("/proveedores", requirePermission("recepcion.gestionar"), controller.proveedores);
router.get("/:id", requirePermission("recepcion.gestionar"), controller.obtener);

router.post("/", requirePermission("recepcion.gestionar"), controller.crear);
router.put("/:id", requirePermission("recepcion.gestionar"), controller.actualizar);
router.post("/:id/anular", requirePermission("recepcion.anular"), controller.anular);
router.post("/:id/confirmar", requirePermission("recepcion.confirmar"), controller.confirmar);

router.post(
  "/ocr",
  requirePermission("recepcion.importar"),
  controller.subirArchivo,
  controller.leerArchivo,
);

module.exports = router;
