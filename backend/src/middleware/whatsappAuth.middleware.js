const {
  isTelefonoAutorizado,
  normalizePhone,
} = require("../repositories/whatsapp.repository");

function whatsappAuthMiddleware(req, res, next) {
  const telefono =
    req.headers["x-whatsapp-phone"] ||
    req.body.telefonoOrigen ||
    req.body.from ||
    req.body.phone;

  if (!telefono) {
    return res.status(401).json({
      ok: false,
      error: "Falta teléfono de origen WhatsApp",
    });
  }

  const telefonoNormalizado = normalizePhone(telefono);

  const autorizado = isTelefonoAutorizado({
    empresaId: req.empresa.id,
    telefono: telefonoNormalizado,
  });

  if (!autorizado) {
    return res.status(403).json({
      ok: false,
      error: "Teléfono no autorizado para operar esta empresa",
      telefono: telefonoNormalizado,
    });
  }

  req.whatsapp = {
    telefono: telefonoNormalizado,
  };

  next();
}

module.exports = whatsappAuthMiddleware;
