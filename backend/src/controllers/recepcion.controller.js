const multer = require("multer");

const service = require("../services/recepcion.service");
const ocr = require("../services/ocrRecepcion.service");
const repo = require("../repositories/recepcion.repository");

function empresaId(req) {
  return Number(req.empresa?.id || req.usuario?.empresaId || 1);
}

function usuarioId(req) {
  return Number(req.usuario?.id || 0) || null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const tipo = ocr.mimePermitido(file.mimetype, file.originalname);
    if (!tipo) {
      const error = new Error("Subí una imagen JPG/PNG/WEBP o un PDF.");
      error.statusCode = 415;
      return cb(error);
    }
    file.mimetype = tipo;
    cb(null, true);
  },
});

function listar(req, res) {
  res.json({
    ok: true,
    recepciones: service.listar({
      empresaId: empresaId(req),
      limit: req.query.limit,
      estado: req.query.estado,
    }),
  });
}

function obtener(req, res) {
  res.json({
    ok: true,
    recepcion: service.obtenerRecepcion({
      empresaId: empresaId(req),
      id: Number(req.params.id),
    }),
  });
}

function crear(req, res) {
  const recepcion = service.crear({
    empresaId: empresaId(req),
    usuarioId: usuarioId(req),
    input: req.body || {},
  });
  res.status(201).json({ ok: true, recepcion });
}

function actualizar(req, res) {
  const recepcion = service.actualizar({
    empresaId: empresaId(req),
    usuarioId: usuarioId(req),
    id: Number(req.params.id),
    input: req.body || {},
  });
  res.json({ ok: true, recepcion });
}

function anular(req, res) {
  const recepcion = service.anular({
    empresaId: empresaId(req),
    usuarioId: usuarioId(req),
    id: Number(req.params.id),
  });
  res.json({ ok: true, recepcion });
}

function confirmar(req, res) {
  const resultado = service.confirmar({
    empresaId: empresaId(req),
    usuarioId: usuarioId(req),
    id: Number(req.params.id),
    permisos: req.permisos || [],
  });
  res.json({ ok: true, ...resultado });
}

function depositos(req, res) {
  res.json({
    ok: true,
    depositos: repo.listarDepositos(empresaId(req)),
  });
}

function proveedores(req, res) {
  res.json({
    ok: true,
    proveedores: repo.listarProveedores({
      empresaId: empresaId(req),
      texto: req.query.q || "",
      limit: req.query.limit,
    }),
  });
}

async function leerArchivo(req, res) {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "Subí la factura, remito o lista de precios." });
  }

  const e = empresaId(req);
  const archivo = service.guardarArchivo({
    empresaId: e,
    buffer: req.file.buffer,
    mime: req.file.mimetype,
    nombre: req.file.originalname,
  });

  try {
    const datos = await ocr.leerDocumento({
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      nombre: req.file.originalname,
    });

    const cabecera = datos.cabecera;
    const input = {
      ...cabecera,
      uuid: req.body?.uuid,
      deposito_id: req.body?.deposito_id,
      origen: "OCR",
      total_documento: cabecera.total,
      percepciones: cabecera.percepciones,
      archivo_nombre: archivo.archivo_nombre,
      archivo_mime: archivo.archivo_mime,
      archivo_path: archivo.archivo_path,
      archivo_url: archivo.archivo_url,
      items: datos.items,
      ocr: datos,
      crear_factura: req.body?.crear_factura,
      actualizar_costo: req.body?.actualizar_costo,
      actualizar_precio: req.body?.actualizar_precio,
      costo_incluye_iva: cabecera.costo_incluye_iva,
      margen_porcentaje: req.body?.margen_porcentaje,
      permitir_parcial: req.body?.permitir_parcial,
      permitir_diferencia_total: req.body?.permitir_diferencia_total,
    };

    const recepcion = service.crear({
      empresaId: e,
      usuarioId: usuarioId(req),
      input,
    });
    res.status(201).json({
      ok: true,
      recepcion,
      ocr: {
        faltantes: datos.faltantes,
        requiere_revision: datos.requiere_revision,
      },
    });
  } catch (error) {
    service.limpiarArchivo(archivo.archivo_path);
    const status = error.statusCode || 502;
    res.status(status).json({ ok: false, error: error.message });
  }
}

function subirArchivo(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, error: "El archivo supera los 10 MB." });
    }
    return res.status(error.statusCode || 400).json({ ok: false, error: error.message });
  });
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  anular,
  confirmar,
  depositos,
  proveedores,
  subirArchivo,
  leerArchivo,
};
