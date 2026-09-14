const db = require("../db/database");
const mailer = require("./mailer.service");

/*
 * Envío central de notificaciones (WhatsApp y email) para las
 * automatizaciones y las alertas del sistema.
 *
 * WhatsApp:
 *  - Empresa: usa la configuración de la empresa (whatsapp_config).
 *  - Superadmin: por webhook de n8n (recomendado) o por Meta directo
 *    (SUPERADMIN_WHATSAPP_TOKEN + SUPERADMIN_WHATSAPP_PHONE_ID).
 */

function normalizarTelefono(t) {
  return String(t || "").replace(/[^0-9]/g, "");
}

async function enviarMeta({ token, phoneId, telefono, mensaje }) {
  const to = normalizarTelefono(telefono);
  if (!to) return { ok: false, motivo: "Teléfono inválido" };
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: String(mensaje || "").slice(0, 4000) },
        }),
      },
    );
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, motivo: j?.error?.message || `HTTP ${resp.status}` };
    return { ok: true, id: j?.messages?.[0]?.id || null };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

async function enviarWhatsappEmpresa({ empresaId, telefono, mensaje }) {
  if (!empresaId || !telefono || !mensaje) return { ok: false, motivo: "Faltan datos" };
  const cfg = db
    .prepare("SELECT token, phone_id, activo FROM whatsapp_config WHERE empresa_id=?")
    .get(empresaId);
  if (!cfg || !cfg.activo || !cfg.token || !cfg.phone_id) {
    return { ok: false, motivo: "WhatsApp de la empresa no configurado" };
  }
  return enviarMeta({ token: cfg.token, phoneId: cfg.phone_id, telefono, mensaje });
}

async function enviarWhatsappSuperadmin({ mensaje }) {
  const sa = db
    .prepare(
      "SELECT telefono, whatsapp_activo FROM super_admins WHERE telefono IS NOT NULL AND telefono <> '' ORDER BY (usuario='superadmin') DESC, id ASC LIMIT 1",
    )
    .get();
  const n8nUrl = process.env.N8N_ALERT_WEBHOOK_URL;
  const activo = Number(sa?.whatsapp_activo || 0) === 1 || Boolean(n8nUrl);
  if (!activo) return { ok: false, motivo: "Avisos al superadmin desactivados" };

  const telefono = sa?.telefono || process.env.SUPERADMIN_WHATSAPP_TO || null;

  if (n8nUrl) {
    try {
      const resp = await fetch(n8nUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET || "",
        },
        body: JSON.stringify({ evento: "alerta.sistema", telefono, mensaje }),
      });
      if (resp.ok) return { ok: true, via: "n8n" };
    } catch (e) {
      /* cae a Meta directo */
    }
  }

  if (process.env.SUPERADMIN_WHATSAPP_TOKEN && process.env.SUPERADMIN_WHATSAPP_PHONE_ID && telefono) {
    return enviarMeta({
      token: process.env.SUPERADMIN_WHATSAPP_TOKEN,
      phoneId: process.env.SUPERADMIN_WHATSAPP_PHONE_ID,
      telefono,
      mensaje,
    });
  }

  console.log("[ALERTA] Sin canal de WhatsApp configurado. Mensaje:", mensaje);
  return { ok: false, motivo: "Sin canal configurado" };
}

async function enviarEmail(opts) {
  return mailer.enviarMail(opts);
}

module.exports = { enviarWhatsappEmpresa, enviarWhatsappSuperadmin, enviarEmail, enviarMeta };
