const router = require("express").Router();
const jwtMiddleware = require("../middleware/jwt.middleware");
const apiRateLimit = require("../middleware/rateLimit.middleware");
const pagoController = require("../controllers/pago.controller");

router.post("/links", jwtMiddleware, apiRateLimit, pagoController.crearLink);
router.get("/links", jwtMiddleware, pagoController.listarLinks);
router.post("/pasarelas", jwtMiddleware, apiRateLimit, pagoController.configurarPasarela);

module.exports = router;
