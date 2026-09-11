const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { enviarMail, configurado } = require("./mailer.service");

/*
 * Recuperación de contraseña por correo. Genera un token de un solo uso,
 * guarda su hash (nunca el token en claro) y envía un enlace por mail.
 * Funciona tanto para usuarios comunes (tipo USUARIO) como para el
 * superadmin (tipo SUPERADMIN).
 */

const EXPIRA_MIN = Number(process.env.RESET_EXPIRA_MIN || 60);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function baseUrl() {
  return String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
}

function crearToken({ tipo, refId, email }) {
  const token = crypto.randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + EXPIRA_MIN * 60000).toISOString();
  db.prepare(
    "INSERT INTO recuperaciones_clave (tipo, ref_id, email, token_hash, expira_en) VALUES (?,?,?,?,?)",
  ).run(tipo, refId, email || null, hashToken(token), expira);
  return token;
}

function cuerpoMail(nombre, link) {
  const html = `<p>Hola ${nombre || ""},</p>
<p>Pediste restablecer tu contraseña. Hacé clic en el siguiente enlace (válido por ${EXPIRA_MIN} minutos):</p>
<p><a href="${link}">${link}</a></p>
<p>Si no lo solicitaste, ignorá este mensaje.</p>`;
  const text = `Para restablecer tu contraseña entrá a: ${link}`;
  return { html, text };
}

async function solicitarUsuario(email) {
  const correo = String(email || "").trim();
  const u = db
    .prepare("SELECT id, nombre, email FROM usuarios WHERE email = ? AND activo = 1")
    .get(correo);
  // No revelamos si el correo existe o no.
  if (!u) return { ok: true };
  const token = crearToken({ tipo: "USUARIO", refId: u.id, email: u.email });
  const link = `${baseUrl()}/#/restablecer?token=${token}`;
  const { html, text } = cuerpoMail(u.nombre, link);
  const envio = await enviarMail({
    to: u.email,
    subject: "Recuperar contraseña",
    html,
    text,
  });
  return { ok: true, enviado: envio.ok, ...(envio.ok ? {} : { link }) };
}

async function solicitarSuperadmin(identificador) {
  const id = String(identificador || "").trim();
  const sa = db
    .prepare(
      "SELECT id, usuario, nombre, email FROM super_admins WHERE (usuario = ? OR email = ?) AND activo = 1",
    )
    .get(id, id);
  if (!sa) return { ok: true };
  const destino = sa.email || process.env.MAIL_RECOVERY_EMAIL || process.env.MAIL_FROM;
  if (!destino) return { ok: true };
  const token = crearToken({ tipo: "SUPERADMIN", refId: sa.id, email: destino });
  const link = `${baseUrl()}/#/restablecer-superadmin?token=${token}`;
  const { html, text } = cuerpoMail(sa.nombre || sa.usuario, link);
  const envio = await enviarMail({
    to: destino,
    subject: "Recuperar contraseña de administración",
    html,
    text,
  });
  return { ok: true, enviado: envio.ok, ...(envio.ok ? {} : { link }) };
}

function restablecer({ token, password }) {
  if (!token || !password) {
    const e = new Error("Token y nueva contraseña son obligatorios");
    e.statusCode = 400;
    throw e;
  }
  if (String(password).length < 6) {
    const e = new Error("La contraseña debe tener al menos 6 caracteres");
    e.statusCode = 400;
    throw e;
  }
  const row = db
    .prepare(
      "SELECT * FROM recuperaciones_clave WHERE token_hash = ? AND usado = 0 ORDER BY id DESC LIMIT 1",
    )
    .get(hashToken(String(token)));
  if (!row) {
    const e = new Error("El enlace no es válido o ya fue usado");
    e.statusCode = 400;
    throw e;
  }
  if (new Date(row.expira_en).getTime() < Date.now()) {
    const e = new Error("El enlace venció. Solicitá uno nuevo");
    e.statusCode = 400;
    throw e;
  }
  const hash = bcrypt.hashSync(password, 10);
  const tx = db.transaction(() => {
    if (row.tipo === "SUPERADMIN") {
      db.prepare("UPDATE super_admins SET password_hash = ? WHERE id = ?").run(hash, row.ref_id);
    } else {
      db.prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?").run(hash, row.ref_id);
    }
    db.prepare("UPDATE recuperaciones_clave SET usado = 1 WHERE id = ?").run(row.id);
  });
  tx();
  return { ok: true, tipo: row.tipo };
}

module.exports = {
  solicitarUsuario,
  solicitarSuperadmin,
  restablecer,
  mailConfigurado: configurado,
};