const express = require("express");

const controller = require("../controllers/arca.controller");
const { requireModulo } = require("../utils/modulos");

/*
 * API ARCA para sistemas externos (FoxPro, etc.).
 * Se monta con apiKeyMiddleware: la API Key identifica la empresa y el
 * módulo ARCA_API habilita o no el acceso.
 */
const router = express.Router();

router.get("/estado", requireModulo("ARCA_API"), controller.estado);
router.get("/ultimo-comprobante", requireModulo("ARCA_API"), controller.ultimoComprobante);
router.post("/comprobantes", requireModulo("ARCA_API"), controller.emitir);

module.exports = router;
