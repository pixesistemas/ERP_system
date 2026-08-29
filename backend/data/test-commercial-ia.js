require("dotenv").config();
const engine = require("../src/core/commercial-conversation/commercialConversationEngine");

(async () => {
  let ctx = engine.start({ message: "hola juan mandame 10 cemento holcim, 5 cal milagro y fijate si tenes esa membrana que te pedi la otra vez creo que era de 40kg, si esta agregame dos, mandalo mañana a la obra de parana y dejamelo en cuenta corriente", channel: "WHATSAPP" });
  const log = async (label, msg) => {
    let r;
    if (msg === "__execute__") r = await engine.execute({ context: ctx, empresaId: 1, usuarioId: null, empresaNombre: "PixeSistemas" });
    else r = await engine.continue({ context: ctx, message: msg, empresaId: 1, usuarioId: null, empresaNombre: "PixeSistemas" });
    ctx = r.context ? Object.assign(ctx, {}) : ctx;
    // reconstruir contexto desde el plain devuelto
    const CC = require("../src/core/commercial-conversation/commercialCommandContext");
    ctx = CC.fromPlainObject(r.context);
    console.log(`\n[${label}] CLIENTE> ${msg}`);
    console.log(`   BOT (${r.response?.type})> ${r.response?.message}`);
    console.log(`   CART (${ctx.command.products.length}):`, ctx.command.products.map((p) => `${p.quantity} ${p.description}`).join(" | "));
    if (ctx.workspaceId) {
      try {
        const W = require("../src/workspace/workspaceEngine");
        const ws = W.load(ctx.workspaceId);
        console.log(`   WS (${ws.items.length}):`, ws.items.map((i) => `${i.cantidad} ${i.descripcion}`).join(" | "));
      } catch (e) { console.log("   WS err", e.message); }
    }
  };

  await log("1 inicia", "__execute__");
  await log("2 cliente", "Carlos López");
  await log("3 confirmar cliente", "sí");
  await log("3b omitir membrana", "omitilo");
  await log("4 quitar", "sacá la cal");
  await log("5 cambiar cantidad", "poneme 5 mejor");
  await log("6 reemplazar", "cambiame el cemento por cal milagro");
  await log("7 saldo", "cuánto tengo de saldo");
  await log("8 resumen", "cuánto llevo");
  await log("9 repetir", "haceme lo mismo que la semana pasada");
})();
