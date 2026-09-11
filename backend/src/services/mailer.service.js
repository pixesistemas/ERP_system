const nodemailer = require("nodemailer");

/*
 * Envío de correos por SMTP. Se configura por variables de entorno:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM
 *
 * Si no está configurado, no falla: registra el correo en el log y avisa
 * que no se pudo enviar (útil en desarrollo).
 */

let transporter = null;

function configurado() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

async function enviarMail({ to, subject, html, text }) {
  if (!to) return { ok: false, motivo: "Sin destinatario" };
  if (!configurado()) {
    console.log(
      `[MAIL] SMTP no configurado. Correo NO enviado a ${to}: "${subject}"`,
    );
    return { ok: false, motivo: "SMTP no configurado" };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
      text: text || undefined,
    });
    return { ok: true };
  } catch (e) {
    console.error(`[MAIL] Error enviando a ${to}:`, e.message);
    return { ok: false, motivo: e.message };
  }
}

module.exports = { enviarMail, configurado };