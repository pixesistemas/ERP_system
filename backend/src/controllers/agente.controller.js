const db = require("../db/database");

/*
 * Relay de impresión: el agente que corre en la PC del local se conecta
 * hacia el ERP (funciona con el ERP en internet, sin que el navegador
 * hable con localhost).
 *
 * - GET  /api/v1/agente/trabajos  (cabecera X-Token): registra el latido
 *   del agente y entrega los trabajos pendientes, marcándolos TOMADO.
 * - POST /api/v1/agente/resultado (cabecera X-Token): el agente informa
 *   si pudo imprimir o el error.
 *
 * Los endpoints son públicos (sin JWT) pero requieren el token del agente,
 * el mismo que se configura en el punto de venta.
 */

const VENTANA_CONECTADO_MS = 90000;

function tokenDe(req) {
  return String(req.headers["x-token"] || req.query?.token || "").trim();
}

function latir(token, req) {
  db.prepare(
    `INSERT INTO agentes_impresion(token,ultima_conexion,plataforma,version)
     VALUES(?,CURRENT_TIMESTAMP,?,?)
     ON CONFLICT(token) DO UPDATE SET ultima_conexion=CURRENT_TIMESTAMP,plataforma=excluded.plataforma,version=excluded.version`,
  ).run(token, String(req.headers["x-plataforma"] || ""), String(req.headers["x-version"] || ""));
}

function agenteConectado(token) {
  const fila = db.prepare("SELECT ultima_conexion FROM agentes_impresion WHERE token=?").get(String(token || ""));
  if (!fila?.ultima_conexion) return false;
  const visto = Date.parse(String(fila.ultima_conexion).replace(" ", "T") + "Z");
  if (Number.isNaN(visto)) return true;
  return Date.now() - visto <= VENTANA_CONECTADO_MS;
}

function estadoAgentePorToken(token) {
  const fila = db.prepare("SELECT * FROM agentes_impresion WHERE token=?").get(String(token || ""));
  if (!fila) return { conectado: false, ultima_conexion: null, plataforma: null, version: null };
  return {
    conectado: agenteConectado(token),
    ultima_conexion: fila.ultima_conexion,
    plataforma: fila.plataforma || null,
    version: fila.version || null,
  };
}

function encolarImpresion({ empresaId, token, impresoraJson, datosBase64, descripcion, puntoVenta }) {
  const info = db
    .prepare(
      `INSERT INTO trabajos_impresion(empresa_id,token,punto_venta,descripcion,datos_base64,impresora_json,estado)
       VALUES(?,?,?,?,?,?,'PENDIENTE')`,
    )
    .run(empresaId, token, puntoVenta || null, descripcion || null, datosBase64, impresoraJson || "{}");
  return Number(info.lastInsertRowid);
}

function tomarTrabajos(req, res, next) {
  try {
    const token = tokenDe(req);
    if (!token) return res.status(400).json({ ok: false, error: "Falta el token del agente." });
    latir(token, req);
    /* Limpieza oportunista de trabajos ya resueltos viejos. */
    try {
      db.prepare(
        "DELETE FROM trabajos_impresion WHERE estado IN ('IMPRESO','ERROR') AND created_at < datetime('now','-7 days')",
      ).run();
    } catch (e) {
      /* sin problema */
    }
    const tx = db.transaction(() => {
      const filas = db
        .prepare(
          `SELECT id,datos_base64,impresora_json,descripcion FROM trabajos_impresion
           WHERE token=? AND estado='PENDIENTE' ORDER BY id LIMIT 5`,
        )
        .all(token);
      const marcar = db.prepare(
        "UPDATE trabajos_impresion SET estado='TOMADO',tomado_at=CURRENT_TIMESTAMP WHERE id=? AND estado='PENDIENTE'",
      );
      const salida = [];
      for (const fila of filas) {
        if (!marcar.run(fila.id).changes) continue;
        let impresora = {};
        try {
          impresora = JSON.parse(fila.impresora_json || "{}");
        } catch (e) {
          impresora = {};
        }
        salida.push({ id: fila.id, datos_base64: fila.datos_base64, descripcion: fila.descripcion, impresora });
      }
      return salida;
    });
    return res.json({ ok: true, trabajos: tx() });
  } catch (error) {
    next(error);
  }
}

function resultadoTrabajo(req, res, next) {
  try {
    const token = tokenDe(req);
    const id = Number(req.body?.id || 0);
    const ok = req.body?.ok === true || req.body?.ok === 1;
    const error = ok ? null : String(req.body?.error || "Error de impresión.").slice(0, 500);
    if (!token) return res.status(400).json({ ok: false, error: "Falta el token del agente." });
    if (!id) return res.status(400).json({ ok: false, error: "Falta el id del trabajo." });
    const fila = db.prepare("SELECT id,estado FROM trabajos_impresion WHERE id=? AND token=?").get(id, token);
    if (!fila) return res.status(404).json({ ok: false, error: "Trabajo no encontrado." });
    db.prepare(
      `UPDATE trabajos_impresion SET estado=?,error=?,resuelto_at=CURRENT_TIMESTAMP WHERE id=? AND token=?`,
    ).run(ok ? "IMPRESO" : "ERROR", error, id, token);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  tomarTrabajos,
  resultadoTrabajo,
  encolarImpresion,
  agenteConectado,
  estadoAgentePorToken,
};
