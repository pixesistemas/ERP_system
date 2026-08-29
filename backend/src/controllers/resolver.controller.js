const ResolverEngine = require("../resolver/resolverEngine");

/*
 * Resuelve un cliente a partir de texto, CUIT o DNI.
 */
function cliente(req, res, next) {
  try {
    const texto = String(req.query.q || "").trim();

    if (texto.length < 2) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar al menos 2 caracteres",
      });
    }

    const resolucion = ResolverEngine.resolveCustomer({
      empresaId: req.empresa.id,
      texto,
    });

    res.json({
      ok: true,
      resolucion,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Resuelve un producto por código, código de barras o descripción.
 */
function producto(req, res, next) {
  try {
    const texto = String(req.query.q || "").trim();

    if (texto.length < 2) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar al menos 2 caracteres",
      });
    }

    const resolucion = ResolverEngine.resolveProduct({
      empresaId: req.empresa.id,
      texto,
    });

    res.json({
      ok: true,
      resolucion,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Resuelve un vendedor por nombre.
 */
function vendedor(req, res, next) {
  try {
    const texto = String(req.query.q || "").trim();

    if (texto.length < 2) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar al menos 2 caracteres",
      });
    }

    const resolucion = ResolverEngine.resolveSeller({
      empresaId: req.empresa.id,
      texto,
    });

    res.json({
      ok: true,
      resolucion,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  cliente,
  producto,
  vendedor,
};
