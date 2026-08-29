const WorkspaceEngine = require("../workspace/workspaceEngine");

// Crea un nuevo workspace comercial en estado BORRADOR.
function crear(req, res, next) {
  try {
    const workspace = WorkspaceEngine.create({
      empresaId: req.empresa.id,
      usuarioId: req.usuario?.id || null,
      canal: req.body.canal || "API",
      telefonoOrigen: req.body.telefonoOrigen || null,
      tipoOperacion: req.body.tipoOperacion,
      condicionVenta: req.body.condicionVenta || "CONTADO",
      listaPrecio: req.body.listaPrecio || "GENERAL",
    });

    res.json({
      ok: true,
      workspace,
    });
  } catch (error) {
    next(error);
  }
}

// Lista los workspaces de la empresa autenticada.
function listar(req, res, next) {
  try {
    const workspaces = WorkspaceEngine.list({
      empresaId: req.empresa.id,
      estado: req.query.estado || null,
      limit: Math.min(Number(req.query.limit || 50), 100),
    });

    res.json({
      ok: true,
      total: workspaces.length,
      workspaces,
    });
  } catch (error) {
    next(error);
  }
}

// Obtiene un workspace con sus artículos y línea de tiempo.
function obtener(req, res, next) {
  try {
    const workspace = WorkspaceEngine.load(Number(req.params.id));

    if (Number(workspace.empresaId) !== Number(req.empresa.id)) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado para ver este workspace",
      });
    }

    res.json({
      ok: true,
      workspace,
    });
  } catch (error) {
    next(error);
  }
}

// Asigna un cliente existente al workspace.
function asignarCliente(req, res, next) {
  try {
    const clienteId = Number(req.body.clienteId);

    if (!clienteId) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar clienteId",
      });
    }

    const workspace = WorkspaceEngine.setCustomer({
      workspaceId: Number(req.params.id),
      empresaId: req.empresa.id,
      clienteId,
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      workspace,
    });
  } catch (error) {
    next(error);
  }
}

// Agrega un artículo manualmente al workspace.
function agregarItem(req, res, next) {
  try {
    const data = req.body;

    if (!data.descripcion) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar la descripción del artículo",
      });
    }

    const workspace = WorkspaceEngine.addItem({
      workspaceId: Number(req.params.id),
      productoId: data.productoId || null,
      codigo: data.codigo || null,
      descripcion: data.descripcion,
      unidad: data.unidad || "UN",
      cantidad: data.cantidad || 1,
      precioUnitario: data.precioUnitario || 0,
      descuento: data.descuento || 0,
      iva: data.iva ?? 21,
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      workspace,
    });
  } catch (error) {
    next(error);
  }
}

// Devuelve un resumen listo para pedir confirmación.
function resumen(req, res, next) {
  try {
    const summary = WorkspaceEngine.getConfirmationSummary(
      Number(req.params.id),
    );

    const workspace = WorkspaceEngine.load(Number(req.params.id));

    if (Number(workspace.empresaId) !== Number(req.empresa.id)) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    res.json({
      ok: true,
      resumen: summary,
    });
  } catch (error) {
    next(error);
  }
}
// Agrega un producto usando Pricing Engine y datos de la base.
function agregarProducto(req, res, next) {
  try {
    const productoId = Number(req.body.productoId);
    const cantidad = Number(req.body.cantidad || 1);

    if (!productoId) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar productoId",
      });
    }

    if (cantidad <= 0) {
      return res.status(400).json({
        ok: false,
        error: "La cantidad debe ser mayor a cero",
      });
    }

    const workspace = WorkspaceEngine.addProduct({
      workspaceId: Number(req.params.id),
      empresaId: req.empresa.id,
      productoId,
      cantidad,
      descuento: Number(req.body.descuento || 0),
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      workspace,
    });
  } catch (error) {
    next(error);
  }
}
// Actualiza cantidad o descuento de un artículo.
function actualizarItem(req, res, next) {
  try {
    const cantidad =
      req.body.cantidad != null ? Number(req.body.cantidad) : undefined;

    const descuento =
      req.body.descuento != null ? Number(req.body.descuento) : undefined;

    if (cantidad === undefined && descuento === undefined) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar cantidad o descuento",
      });
    }

    const workspace = WorkspaceEngine.updateItem({
      workspaceId: Number(req.params.id),
      empresaId: req.empresa.id,
      itemId: Number(req.params.itemId),
      cantidad,
      descuento,
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      workspace,
    });
  } catch (error) {
    next(error);
  }
}

// Elimina un artículo del workspace.
function eliminarItem(req, res, next) {
  try {
    const workspace = WorkspaceEngine.removeItem({
      workspaceId: Number(req.params.id),
      empresaId: req.empresa.id,
      itemId: Number(req.params.itemId),
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      workspace,
    });
  } catch (error) {
    next(error);
  }
}
/*
 * Confirma un Workspace.
 */
async function confirmar(req, res, next) {
  try {
    const ConfirmationEngine = require("../workspace/workspaceConfirmationEngine");

    const resultado = await ConfirmationEngine.confirm({
      workspaceId: Number(req.params.id),

      empresa: req.empresa.nombre,

      empresaId: req.empresa.id,

      usuarioId: req.usuario?.id,
    });

    res.json({
      ok: true,

      resultado,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Resuelve un cliente por texto y lo asigna
 * al workspace cuando hay una coincidencia única.
 */
function resolverCliente(req, res, next) {
  try {
    const texto = String(req.body.texto || "").trim();

    if (texto.length < 2) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar al menos 2 caracteres",
      });
    }

    const resultado = WorkspaceEngine.resolveAndSetCustomer({
      workspaceId: Number(req.params.id),
      empresaId: req.empresa.id,
      texto,
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Resuelve un producto por texto y lo agrega
 * al workspace cuando hay una coincidencia única.
 */
function resolverProducto(req, res, next) {
  try {
    const texto = String(req.body.texto || "").trim();

    const cantidad = Number(req.body.cantidad || 1);

    if (texto.length < 2) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar al menos 2 caracteres",
      });
    }

    if (cantidad <= 0) {
      return res.status(400).json({
        ok: false,
        error: "La cantidad debe ser mayor a cero",
      });
    }

    const resultado = WorkspaceEngine.resolveAndAddProduct({
      workspaceId: Number(req.params.id),
      empresaId: req.empresa.id,
      texto,
      cantidad,
      descuento: Number(req.body.descuento || 0),
      usuarioId: req.usuario?.id || null,
    });

    res.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  crear,
  listar,
  obtener,
  asignarCliente,
  agregarItem,
  agregarProducto,
  actualizarItem,
  eliminarItem,
  resolverCliente,
  resolverProducto,
  resumen,
  confirmar,
};
