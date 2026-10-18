const net = require("net");
const http = require("http");
const assert = require("assert");
const agente = require("../server");

function peticion(puerto, metodo, ruta, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port: puerto, method: metodo, path: ruta, headers: { ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}), ...headers } },
      (res) => {
        const partes = [];
        res.on("data", (c) => partes.push(c));
        res.on("end", () => {
          const texto = Buffer.concat(partes).toString("utf8");
          let parsed = null;
          try {
            parsed = JSON.parse(texto);
          } catch (e) {
            parsed = texto;
          }
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* Impresora de red falsa que junta lo que recibe. */
  const recibido = [];
  const impresoraFalsa = net.createServer((sock) => {
    sock.on("data", (d) => recibido.push(d));
  });
  await new Promise((r) => impresoraFalsa.listen(0, "127.0.0.1", r));
  const puertoImpresora = impresoraFalsa.address().port;

  const cfg = { puerto: 0, token: "secreto", espera_impresora_ms: 3000 };
  const servidor = agente.crearServidor(cfg);
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const puerto = servidor.address().port;

  /* 1) Preflight CORS con la cabecera que exige Chrome para localhost. */
  const preflight = await peticion(puerto, "OPTIONS", "/imprimir");
  assert.strictEqual(preflight.status, 204);
  assert.strictEqual(preflight.headers["access-control-allow-private-network"], "true");

  /* 2) Salud. */
  const salud = await peticion(puerto, "GET", "/salud");
  assert.strictEqual(salud.status, 200);
  assert.strictEqual(salud.data.ok, true);

  /* 3) Token incorrecto: rechaza. */
  const sinToken = await peticion(puerto, "POST", "/imprimir", {
    token: "mal",
    datos_base64: Buffer.from("X").toString("base64"),
    impresora: { tipo: "RED", host: "127.0.0.1", puerto: puertoImpresora },
  });
  assert.strictEqual(sinToken.status, 401);

  /* 4) Impresión por red: los bytes llegan tal cual a la impresora. */
  const payload = Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from("TICKET DE PRUEBA ñ áé", "latin1")]);
  const ok = await peticion(puerto, "POST", "/imprimir", {
    token: "secreto",
    datos_base64: payload.toString("base64"),
    impresora: { tipo: "RED", host: "127.0.0.1", puerto: puertoImpresora },
  });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.data.ok, true);
  assert.strictEqual(ok.data.bytes, payload.length);
  await dormir(150);
  const juntado = Buffer.concat(recibido);
  assert.ok(juntado.equals(payload), "Los bytes recibidos no coinciden con los enviados.");

  /* 5) Impresora inalcanzable: error claro, no cuelga. */
  const caida = await peticion(puerto, "POST", "/imprimir", {
    token: "secreto",
    datos_base64: payload.toString("base64"),
    impresora: { tipo: "RED", host: "127.0.0.1", puerto: 1 },
  });
  assert.strictEqual(caida.status, 500);
  assert.ok(String(caida.data.error).includes("No se pudo conectar"), caida.data.error);

  /* 6) Sin datos: rechaza. */
  const vacio = await peticion(puerto, "POST", "/imprimir", { token: "secreto", impresora: { tipo: "RED", host: "127.0.0.1", puerto: puertoImpresora } });
  assert.strictEqual(vacio.status, 400);

  console.log("agente-impresion: OK — CORS/PNA, token, impresión por red byte a byte y errores claros.");
  servidor.close();
  impresoraFalsa.close();
})().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
