const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const controller = require("../controllers/superadmin.controller");
const superadminMiddleware = require("../middleware/superadmin.middleware");

router.post("/auth/login", controller.loginSuperAdmin);
router.post("/auth/recuperar", controller.recuperarSuperadmin);
router.post("/auth/restablecer", controller.restablecerSuperadmin);

router.use(superadminMiddleware);

const uploadDir = path.join(process.cwd(), "storage", "private", "fiscal");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) =>
    cb(null, `sa-${req.params.id || 0}-${req.params.type}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = req.params.type === "key" ? [".key", ".pem"].includes(ext) : [".crt", ".cer", ".pem"].includes(ext);
    cb(ok ? null : new Error("Formato de archivo no permitido."), ok);
  },
});

router.get("/empresas", controller.listarEmpresas);
router.post("/empresas", controller.crearEmpresa);
router.patch("/empresas/:id", controller.actualizarEmpresa);
router.get("/empresas/:id/modulos", controller.listarModulosEmpresa);
router.put("/empresas/:id/modulos", controller.setModuloEmpresa);
router.get("/empresas/:id/tema", controller.getTemaEmpresa);
router.put("/empresas/:id/tema", controller.setTemaEmpresa);
router.get("/empresas/:id/datos-fiscales", controller.getDatosFiscalesEmpresa);
router.put("/empresas/:id/datos-fiscales", controller.setDatosFiscalesEmpresa);
router.post("/empresas/:id/archivos-fiscales/:type", upload.single("file"), controller.uploadArchivoFiscalEmpresa);
const uploadCsv = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => cb(null, `import-${req.params.id || 0}-${Date.now()}.csv`) }) });
router.post("/empresas/:id/importar-clientes", uploadCsv.single("file"), controller.importarClientesEmpresa);
router.post("/empresas/:id/importar-productos", uploadCsv.single("file"), controller.importarProductosEmpresa);

router.get("/usuarios", controller.listarUsuarios);
router.post("/usuarios", controller.crearUsuario);
router.patch("/usuarios/:id", controller.actualizarUsuario);

router.get("/licencias", controller.listarLicencias);
router.post("/licencias", controller.crearLicencia);
router.patch("/licencias/:id/estado", controller.cambiarEstadoLicencia);

router.get("/changelog", controller.listarChangelog);
router.post("/changelog", controller.crearChangelog);
router.patch("/changelog/:id", controller.actualizarChangelog);
router.delete("/changelog/:id", controller.eliminarChangelog);
router.get("/version", controller.getVersionSistema);
router.post("/version/subir", controller.subirVersionSistema);

module.exports = router;