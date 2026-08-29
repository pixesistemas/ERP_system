require("dotenv").config();
const Flow = require("../src/services/whatsappClienteFlow.service");

(async () => {
  // aseguramos arrancar limpio para este teléfono
  const tel = "5493454001234";
  const secuencia = [
    "factura",
    "agregame 2 cemento holcim",
    "cambiame el Holcim por Loma Negra",
    "poneme 10 mejor",
    "sacá la cal",
    "cuánto tengo de saldo",
    "hola juan mandame 10 cemento holcim, 5 cal milagro y fijate si tenes esa membrana que te pedi la otra vez creo que era de 40kg, si esta agregame dos, mandalo mañana a la obra de parana y dejamelo en cuenta corriente",
  ];
  let i = 0;
  for (const m of secuencia) {
    i++;
    const r = await Flow.mensajeCliente({ empresaId: 1, empresaNombre: "PixeSistemas", telefono: tel, mensaje: m });
    console.log(`\n[${i}] CLIENTE> ${m.slice(0, 50)}`);
    console.log(`    BOT (${r.estado})> ${(r.respuesta || "").split("\n").join(" | ")}`);
  }
})();
