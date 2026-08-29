const {
  crearListaPrecio,
  getListaByNombre,
  setPrecioLista,
  listarListasPrecio,
  listarItemsLista,
  setDescuentoCliente,
  listarDescuentosCliente,
} = require("../repositories/pricing.repository");

function crearLista(req, res, next) {
  try {
    const lista = crearListaPrecio({
      empresaId: req.empresa.id,
      nombre: req.body.nombre,
    });

    res.json({ ok: true, lista });
  } catch (error) {
    next(error);
  }
}

function listar(req, res, next) {
  try {
    const listas = listarListasPrecio({
      empresaId: req.empresa.id,
    });

    res.json({
      ok: true,
      total: listas.length,
      listas,
    });
  } catch (error) {
    next(error);
  }
}

function setPrecio(req, res, next) {
  try {
    const lista = getListaByNombre({
      empresaId: req.empresa.id,
      nombre: req.params.nombre,
    });

    if (!lista) {
      return res.status(404).json({
        ok: false,
        error: "Lista de precios no encontrada",
      });
    }

    const item = setPrecioLista({
      listaId: lista.id,
      productoId: req.body.productoId,
      precio: req.body.precio,
    });

    res.json({ ok: true, item });
  } catch (error) {
    next(error);
  }
}

function items(req, res, next) {
  try {
    const lista = getListaByNombre({
      empresaId: req.empresa.id,
      nombre: req.params.nombre,
    });

    if (!lista) {
      return res.status(404).json({
        ok: false,
        error: "Lista de precios no encontrada",
      });
    }

    const data = listarItemsLista({
      listaId: lista.id,
    });

    res.json({
      ok: true,
      lista,
      total: data.length,
      items: data,
    });
  } catch (error) {
    next(error);
  }
}
function setDescuento(req, res, next) {
  try {
    const descuento = setDescuentoCliente({
      empresaId: req.empresa.id,
      clienteDoc: req.body.clienteDoc,
      productoId: req.body.productoId || null,
      porcentaje: req.body.porcentaje,
    });

    res.json({
      ok: true,
      descuento,
    });
  } catch (error) {
    next(error);
  }
}

function descuentosCliente(req, res, next) {
  try {
    const descuentos = listarDescuentosCliente({
      empresaId: req.empresa.id,
      clienteDoc: req.params.clienteDoc,
    });

    res.json({
      ok: true,
      total: descuentos.length,
      descuentos,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  crearLista,
  listar,
  setPrecio,
  items,
  setDescuento,
  descuentosCliente,
};
