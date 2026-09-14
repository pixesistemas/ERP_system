/*
 * Protección de los endpoints de backup. A diferencia del resto de la API
 * de n8n (que usa la API Key de una empresa), el backup contiene datos de
 * TODAS las empresas, así que exige una clave separada del servidor.
 *
 * Configurá `BACKUP_API_KEY` en el `.env` del backend y enviá el mismo
 * valor en el header `x-backup-key`. Si la variable no está definida, el
 * endpoint queda cerrado (503) para no exponer la base por accidente.
 */
function backupKeyMiddleware(req, res, next) {
  const esperada = process.env.BACKUP_API_KEY;
  if (!esperada) {
    return res.status(503).json({
      ok: false,
      error: "Backup no configurado. Definí BACKUP_API_KEY en el servidor.",
    });
  }
  const recibida = req.headers["x-backup-key"];
  if (!recibida || recibida !== esperada) {
    return res.status(401).json({
      ok: false,
      error: "Clave de backup inválida o ausente (header x-backup-key).",
    });
  }
  next();
}

module.exports = backupKeyMiddleware;
