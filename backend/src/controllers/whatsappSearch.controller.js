const { buscarClientes } = require("../repositories/cliente.repository");

const { buscarProductos } = require("../repositories/producto.repository");

function validarTexto(req, res) {
  const texto = String(req.query.q || "").trim();

  if (texto.length < 2) {
    res.status(400).json({
      ok: false,
      error: "Debe informar al menos 2 caracteres en q",
    });

    return null;
  }

  return texto;
}

function clientes(req, res, next) {
  try {
    const texto = validarTexto(req, res);

    if (!texto) return;

    const resultados = buscarClientes({
      empresaId: req.empresa.id,
      texto,
      limit: Math.min(Number(req.query.limit || 10), 25),
    });

    res.json({
      ok: true,
      tipo: "CLIENTES",
      consulta: texto,
      total: resultados.length,
      resultados: resultados.map((cliente) => ({
        id: cliente.id,
        razonSocial: cliente.razon_social || cliente.nombre || "",
        cuit: cliente.cuit || null,
        dni: cliente.dni || null,
        telefono: cliente.telefono || null,
        condicionIVA: cliente.condicion_iva || null,
        domicilio: cliente.domicilio || cliente.direccion || null,
      })),
    });
  } catch (error) {
    next(error);
  }
}

function productos(req, res, next) {
  try {
    const texto = validarTexto(req, res);

    if (!texto) return;

    const resultados = buscarProductos({
      empresaId: req.empresa.id,
      texto,
      limit: Math.min(Number(req.query.limit || 10), 25),
    });

    res.json({
      ok: true,
      tipo: "PRODUCTOS",
      consulta: texto,
      total: resultados.length,
      resultados: resultados.map((producto) => ({
        id: producto.id,
        codigo: producto.codigo,
        codigoBarra: producto.codigo_barra || producto.codbarra || null,
        descripcion: producto.descripcion,
        precio: Number(producto.precio || 0),
        iva: Number(producto.iva || 0),
        unidad: producto.unidad || "UN",
      })),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  clientes,
  productos,
};
