const express = require("express");
const router = express.Router();

const controller = require("../controllers/auth.controller");
const jwtMiddleware = require("../middleware/jwt.middleware");

router.post("/login", controller.login);
router.post("/recuperar", controller.recuperarClave);
router.post("/restablecer", controller.restablecerClave);
router.get("/me", jwtMiddleware, controller.me);
router.post("/refresh", controller.refresh);
router.post("/logout", controller.logout);

module.exports = router;
