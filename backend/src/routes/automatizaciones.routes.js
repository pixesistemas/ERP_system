const express = require("express");

const c = require("../controllers/automatizaciones.controller");

/*
 * Automatizaciones que dispara n8n por cron o eventos. Se montan dos veces:
 *  - /api/v1/automatizaciones (JWT, para el panel del cliente)
 *  - /api/v1/n8n (x-api-key de la empresa, para n8n)
 */
const router = express.Router();

router.get("/config", c.config);
router.get("/reporte-diario", c.reporteDiarioPreview);
router.post("/reporte-diario", c.reporteDiario);
router.get("/stock-minimo", c.stockMinimo);
router.post("/stock-minimo/alertar", c.alertarStock);
router.post("/reintentar-cae", c.reintentarCae);
router.get("/cobranzas", c.cobranzas);
router.post("/cobranzas/enviar", c.enviarCobranzas);
router.post("/conciliar-pago", c.conciliarPago);
router.post("/avisar-reparto", c.avisarReparto);
router.post("/escalar", c.escalar);

module.exports = router;
