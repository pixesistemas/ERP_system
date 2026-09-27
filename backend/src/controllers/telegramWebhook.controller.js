const db = require("../db/database");

const WhatsAppClienteFlow = require("../services/whatsappClienteFlow.service");

/*
 * Canal de PRUEBAS por Telegram (gratis).
 *
 * Usa exactamente el mismo motor que WhatsApp (pedidos de clientes), así
 * se puede probar todo el circuito sin conectar Meta en producción.
 *
 * Configuración (variables de entorno en el servidor):
 *   TELEGRAM_BOT_TOKEN    token del bot (se crea con @BotFather)
 *   TELEGRAM_EMPRESA_ID   id de la empresa que atiende el bot (ej. Seitu)
 *
 * El webhook se registra una vez con:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<PUBLIC_BASE_URL>/api/v1/telegram/webhook
 */

function tokenBot() {
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

async function enviar(chatId, texto) {
  const token = tokenBot();
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
  } catch {
    /* si Telegram falla, el mensaje se pierde: es un canal de prueba */
  }
}

async function webhook(req, res) {
  /* Telegram exige respuesta rápida; el procesamiento sigue después. */
  res.status(200).json({ ok: true });

  try {
    const mensaje = req.body?.message || req.body?.edited_message || null;
    const texto = String(mensaje?.text || "").trim();
    const chatId = mensaje?.chat?.id;
    if (!texto || !chatId) return;

    const empresaId = Number(process.env.TELEGRAM_EMPRESA_ID || 1);
    const empresa = db.prepare("SELECT nombre FROM empresas WHERE id=?").get(empresaId);

    const nombreDeclarado =
      [mensaje?.from?.first_name, mensaje?.from?.last_name].filter(Boolean).join(" ") || null;

    const resultado = await WhatsAppClienteFlow.mensajeCliente({
      empresaId,
      empresaNombre: empresa?.nombre || "",
      telefono: String(chatId),
      mensaje: texto,
      nombreDeclarado,
    });

    const respuesta =
      resultado?.respuesta ||
      resultado?.response?.message ||
      "No pude procesar tu mensaje. Probá de nuevo.";

    await enviar(chatId, respuesta);
  } catch (error) {
    console.error("[telegram] error:", error.message);
  }
}

function estado(req, res) {
  const configurado = Boolean(tokenBot());
  const empresaId = Number(process.env.TELEGRAM_EMPRESA_ID || 1);
  const empresa = db.prepare("SELECT nombre FROM empresas WHERE id=?").get(empresaId);
  const base = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  res.json({
    ok: true,
    configurado,
    empresaId,
    empresaNombre: empresa?.nombre || null,
    webhookUrl: `${base}/api/v1/telegram/webhook`,
  });
}

module.exports = { webhook, estado };
