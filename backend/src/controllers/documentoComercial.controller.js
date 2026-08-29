const {
  saveDocumento,
  getDocumentoById,
  listDocumentos,
  updateEstadoDocumento,
} = require("../repositories/documentoComercial.repository");

const {
  listarRelacionesDocumento,
} = require("../repositories/documentoRelacion.repository");

const {
  convertirDocumento,
} = require("../services/documentoConversion.service");

const { generarPDFDocumento } = require("../services/documentoPdf.service");

const WorkflowEngine = require("../workflow/workflowEngine");

async function crearDocumento(req, res, next) {
  try {
    const data = req.body;

    const documento = saveDocumento({
      empresaId: req.empresa.id,
      clienteId: data.clienteId || null,
      vendedorId: data.vendedorId || null,
      tipo: data.tipo,
      estado: data.estado || "BORRADOR",
      items: data.items || [],
      observaciones: data.observaciones || null,
      puntoVenta: data.puntoVenta || 1,
    });

    const pdfResult = await generarPDFDocumento({
      empresa: req.empresa,
      documentoId: documento.id,
    });

    res.json({
      ok: true,
      documento: pdfResult.documento,
      pdf: pdfResult.pdf,
    });
  } catch (error) {
    next(error);
  }
}

async function generarPDF(req, res, next) {
  try {
    const result = await generarPDFDocumento({
      empresa: req.empresa,
      documentoId: Number(req.params.id),
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

function listarDocumentos(req, res, next) {
  try {
    const documentos = listDocumentos({
      empresaId: req.empresa.id,
      tipo: req.query.tipo || null,
    }).map((documento) => ({
      ...documento,
      total: Number(documento.importe_total || documento.total || 0),
      neto: Number(documento.importe_neto || 0),
      iva: Number(documento.importe_iva || 0),
      items: parseItems(documento.items_json),
    }));

    res.json({
      ok: true,
      total: documentos.length,
      documentos,
    });
  } catch (error) {
    next(error);
  }
}

function parseItems(itemsJson) {
  if (!itemsJson) {
    return [];
  }

  try {
    return JSON.parse(itemsJson) || [];
  } catch {
    return [];
  }
}

function obtenerDocumento(req, res, next) {
  try {
    const documento = getDocumentoById(req.params.id);

    if (!documento) {
      return res.status(404).json({
        ok: false,
        error: "Documento no encontrado",
      });
    }

    if (documento.empresa_id !== req.empresa.id) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    res.json({
      ok: true,
      documento,
    });
  } catch (error) {
    next(error);
  }
}

function cambiarEstadoDocumento(req, res, next) {
  try {
    const estado = req.body?.estado;

    if (!estado) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar estado",
      });
    }

    const actual = getDocumentoById(req.params.id);

    if (!actual) {
      return res.status(404).json({
        ok: false,
        error: "Documento no encontrado",
      });
    }

    if (actual.empresa_id !== req.empresa.id) {
      return res.status(403).json({
        ok: false,
        error: "No autorizado",
      });
    }

    WorkflowEngine.validateEstado(actual.tipo, actual.estado, estado);

    const documento = updateEstadoDocumento({
      documentoId: req.params.id,
      empresaId: req.empresa.id,
      estado,
    });

    res.json({
      ok: true,
      documento,
    });
  } catch (error) {
    next(error);
  }
}

function convertir(req, res, next) {
  try {
    const nuevoTipo = req.body?.nuevoTipo;

    if (!nuevoTipo) {
      return res.status(400).json({
        ok: false,
        error: "Debe informar nuevoTipo",
      });
    }

    const nuevo = convertirDocumento({
      empresaId: req.empresa.id,
      documentoOrigenId: req.params.id,
      nuevoTipo,
      subtipo: req.body?.subtipo || null,
    });

    res.json({
      ok: true,
      documento: nuevo,
    });
  } catch (error) {
    next(error);
  }
}

function relaciones(req, res, next) {
  try {
    const data = listarRelacionesDocumento({
      empresaId: req.empresa.id,
      documentoId: req.params.id,
    });

    res.json({
      ok: true,
      relaciones: data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  crearDocumento,
  listarDocumentos,
  obtenerDocumento,
  cambiarEstadoDocumento,
  convertir,
  relaciones,
  generarPDF,
};
