const db = require("../db/database");
const CommercialConversation = require("../core/commercial-conversation");

function getWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe") {
    const row = db.prepare("SELECT verify_token FROM whatsapp_config WHERE verify_token=? AND activo=1 LIMIT 1").get(String(token || ""));
    if (row) return res.status(200).send(String(challenge || ""));
    return res.status(403).send("verify_token inválido");
  }
  return res.status(400).send("modo no soportado");
}

async function postWebhook(req, res) {
  try {
    const entries = (req.body && req.body.entry) || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        const value = change.value || {};
        const mensajes = value.messages || [];
        const displayPhone = String(value.metadata?.display_phone_number || "").trim();
        if (!mensajes.length || !displayPhone) continue;
        const config = db.prepare("SELECT empresa_id,numero,phone_id,token FROM whatsapp_config WHERE numero=? AND activo=1").get(displayPhone);
        if (!config) continue;
        const empresa = db.prepare("SELECT id,nombre FROM empresas WHERE id=?").get(config.empresa_id);
        if (!empresa) continue;
        for (const msg of mensajes) {
          const from = String(msg.from || "").trim();
          const tipo = String(msg.type || "text");
          const texto = String(msg.text?.body || "").trim();
          if (!from) continue;
          if (tipo === "audio") {
            const mediaId = msg.audio?.id || null;
            const mediaUrl = mediaId ? "https://graph.facebook.com/v21.0/" + encodeURIComponent(mediaId) : null;
            db.prepare("INSERT INTO whatsapp_notificaciones(empresa_id,telefono,estado_pedido,mensaje,estado) VALUES(?,?,'AUDIO',?,?)").run(empresa.id, from, mediaUrl ? "Cliente envió un audio (ID de media " + mediaId + "). Respondé pidiendo texto o escuchalo desde Meta." : "Cliente envió un audio.", "PENDIENTE");
            if (mediaUrl) {
              try {
                const audioResp = await fetch(mediaUrl, { headers: { Authorization: "Bearer " + (config.token || "") } });
                const buf = Buffer.from(await audioResp.arrayBuffer());
                const ia = db.prepare("SELECT ia_api_key FROM whatsapp_config WHERE empresa_id=?").get(empresa.id);
                if (ia && ia.ia_api_key) {
                  const form = new FormData();
                  form.append("model", "whisper-1");
                  form.append("file", new Blob([buf], { type: "audio/ogg" }), "audio.ogg");
                  const t = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + ia.ia_api_key }, body: form });
                  const tj = await t.json().catch(() => ({}));
                  const transcrito = String(tj.text || "").trim();
                  if (transcrito) {
                    db.prepare("UPDATE whatsapp_notificaciones SET mensaje=?,estado='TRANSCRIPTO' WHERE id=(SELECT MAX(id) FROM whatsapp_notificaciones WHERE empresa_id=? AND telefono=? AND estado_pedido='AUDIO')").run("Audio transcrito: " + transcrito, empresa.id, from);
                    continue;
                  }
                }
              } catch (e) {}
            }
            continue;
          }
          if (tipo === "image") {
            const mediaId = msg.image?.id || null;
            db.prepare("INSERT INTO whatsapp_notificaciones(empresa_id,telefono,estado_pedido,mensaje,estado) VALUES(?,?,'PAGO_PENDIENTE_VERIFICACION',?,?)").run(empresa.id, from, mediaId ? "Comprobante de pago recibido (ID de media " + mediaId + "). Verificá el pago y marcá como verificado." : "Comprobante de pago recibido. Verificá el pago y marcá como verificado.", "PENDIENTE");
            continue;
          }
          if (!texto) continue;
          let conversation = CommercialConversation.Service.findActive({ empresaId: empresa.id, telefono: from, canal: "WHATSAPP" });
          let respuesta = null;
          if (!conversation) {
            const context = CommercialConversation.Engine.start({ message: texto, channel: "WHATSAPP" });
            context.telefonoOrigen = from;
            conversation = CommercialConversation.Service.create({ empresaId: empresa.id, telefono: from, canal: "WHATSAPP", context });
            const result = await CommercialConversation.Engine.execute({ context: conversation.context, empresaId: empresa.id, usuarioId: null, empresaNombre: empresa.nombre });
            CommercialConversation.Service.save(conversation);
            respuesta = result?.response?.message || null;
          } else {
            const result = await CommercialConversation.Engine.continue({ context: conversation.context, message: texto, empresaId: empresa.id, usuarioId: null, empresaNombre: empresa.nombre });
            CommercialConversation.Service.save(conversation);
            respuesta = result?.response?.message || null;
          }
          if (respuesta && config.token && config.phone_id) {
            try {
              await fetch("https://graph.facebook.com/v21.0/" + encodeURIComponent(config.phone_id) + "/messages", {
                method: "POST",
                headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
                body: JSON.stringify({ messaging_product: "whatsapp", to: from, type: "text", text: { body: respuesta } }),
              });
            } catch (e) {}
          }
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

module.exports = { getWebhook, postWebhook };