/*
 * Aviso de licencias por vencer.
 *
 * Todos los días revisa las licencias activas que vencen dentro de
 * LICENCIA_AVISO_DIAS (7 por defecto) y avisa al superadmin por Telegram
 * (gratis) y/o WhatsApp. Cada licencia se avisa una vez por día.
 *
 * Variables de entorno:
 *   LICENCIA_AVISO_DIAS          días de anticipación (default 7)
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_SUPERADMIN_CHAT_ID   aviso por Telegram
 *   SUPERADMIN_WHATSAPP_* o n8n                       aviso por WhatsApp
 */
const repo = require("../repositories/superadmin.repository");
const { enviarWhatsappSuperadmin, enviarTelegramSuperadmin } = require("./notificacion.service");

const INTERVALO_MS = 12 * 60 * 60 * 1000;

function diasHasta(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${String(fecha).slice(0, 10)}T00:00:00`);
  return Math.round((venc.getTime() - hoy.getTime()) / 86400000);
}

async function revisarLicenciasPorVencer() {
  try {
    const dias = Math.max(1, Number(process.env.LICENCIA_AVISO_DIAS || 7));
    const licencias = repo.licenciasPorVencer(dias);
    const hoy = new Date().toISOString().slice(0, 10);
    let avisadas = 0;
    for (const lic of licencias) {
      const ultimo = String(lic.aviso_vencimiento_en || "").slice(0, 10);
      if (ultimo === hoy) continue;
      const restantes = diasHasta(lic.fecha_vencimiento);
      const mensaje =
        `ERP: la licencia de ${lic.empresa_nombre} vence el ${String(lic.fecha_vencimiento).slice(0, 10)}` +
        ` (${restantes <= 0 ? "vence hoy" : `faltan ${restantes} día/s`}).` +
        ` Plan ${lic.plan}. Renovación automática: ${Number(lic.renovacion_automatica || 0) === 1 ? "SÍ" : "NO"}.` +
        ` Entrá al superadmin para renovarla.`;
      const [tg, wa] = await Promise.all([
        enviarTelegramSuperadmin({ mensaje }),
        enviarWhatsappSuperadmin({ mensaje }),
      ]);
      if (tg.ok || wa.ok) {
        repo.marcarAvisoLicencia(lic.id);
        avisadas++;
        console.log(`[licencias] aviso enviado: ${lic.empresa_nombre} (Telegram: ${tg.ok ? "sí" : "no"}, WhatsApp: ${wa.ok ? "sí" : "no"})`);
      }
    }
    return { ok: true, revisadas: licencias.length, avisadas };
  } catch (error) {
    console.error("[licencias] error al revisar vencimientos:", error.message);
    return { ok: false, error: error.message };
  }
}

function iniciarAvisoLicencias() {
  revisarLicenciasPorVencer();
  const timer = setInterval(revisarLicenciasPorVencer, INTERVALO_MS);
  if (timer.unref) timer.unref();
}

module.exports = { revisarLicenciasPorVencer, iniciarAvisoLicencias };
