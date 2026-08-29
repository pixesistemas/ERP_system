const express = require("express");
const router = express.Router();

const controller = require("../controllers/documentoComercial.controller");
const requirePermission = require("../middleware/permission.middleware");

router.post(
  "/",
  requirePermission("documentos.crear"),
  controller.crearDocumento,
);

router.get(
  "/",
  requirePermission("documentos.consultar"),
  controller.listarDocumentos,
);

router.get(
  "/:id",
  requirePermission("documentos.consultar"),
  controller.obtenerDocumento,
);

router.patch(
  "/:id/estado",
  requirePermission("documentos.crear"),
  controller.cambiarEstadoDocumento,
);

router.post(
  "/:id/convertir",
  requirePermission("documentos.convertir"),
  controller.convertir,
);

router.get(
  "/:id/relaciones",
  requirePermission("documentos.consultar"),
  controller.relaciones,
);

router.post(
  "/:id/pdf",
  requirePermission("documentos.consultar"),
  controller.generarPDF,
);

module.exports = router;
