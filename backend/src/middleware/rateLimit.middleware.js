const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Demasiadas solicitudes. Intente nuevamente en unos segundos.",
  },
  keyGenerator: (req) => {
    if (req.empresa?.id) {
      return `empresa:${req.empresa.id}`;
    }

    return ipKeyGenerator(req.ip);
  },
});

module.exports = apiRateLimit;
