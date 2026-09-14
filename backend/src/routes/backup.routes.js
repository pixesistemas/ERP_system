const express = require("express");

const c = require("../controllers/automatizaciones.controller");
const backupKeyMiddleware = require("../middleware/backupKey.middleware");

/*
 * Backups de la base completa. Se aíslan del resto de las automatizaciones
 * porque el archivo resultante incluye datos de todas las empresas: sólo
 * accesibles con `x-backup-key` (BACKUP_API_KEY), nunca con una API Key de
 * empresa.
 */
const router = express.Router();

router.use(backupKeyMiddleware);
router.post("/", c.backup);
router.get("/descargar", c.descargarBackup);

module.exports = router;
