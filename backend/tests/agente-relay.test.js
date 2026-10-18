const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/agente-relay-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const erp = require("../src/controllers/erpConsolidation.controller");
const agente = require("../src/controllers/agente.controller");

const empresa = db.prepare("SELECT * FROM empresas WHERE nombre='empresa1'").get();
const producto = db.prepare("SELECT * FROM productos WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const branch = db.prepare("SELECT id FROM sucursales WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
const cashier = db.prepare("SELECT id FROM cajeros WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
let pv = db.prepare("SELECT * FROM puntos_venta WHERE empresa_id=? ORDER BY id LIMIT 1").get(empresa.id);
if (!empresa || !producto || !branch || !cashier || !pv) throw new Error("El seed demo no tiene datos suficientes.");

const TOKEN = "token-relay-prueba";
db.prepare(
  `UPDATE puntos_venta SET impresion_modo='AGENTE', agente_conexion='SERVIDOR', agente_token=?,
   impresora_tipo='RED', impresora_host='127.0.0.1', impresora_puerto=9999, impresora_nombre=''
   WHERE id=?`,
).run(TOKEN, pv.id);

function conRespuesta(fn, { body = {}, params = {}, query = {}, headers = {} } = {}) {
  let status = 200;
  let payload = null;
  const req = {
    empresa: { id: empresa.id },
    user: { id: 1, empresaId: empresa.id },
    usuario: { id: 1, empresaId: empresa.id },
    headers,
    body,
    params,
    query,
  };
  const res = {
    status(v) {
      status = v;
      return this;
    },
    json(v) {
      payload = v;
      return v;
    },
  };
  return Promise.resolve(fn(req, res)).then(() => ({ status, payload }));
}

function item() {
  return {
    producto_id: producto.id,
    codigo: producto.codigo,
    descripcion: producto.descripcion,
    unidad: "UN",
    cantidad: 1,
    precio_unitario: 1000,
    iva: 21,
    costo: 0,
  };
}

(async () => {
  const nota = await conRespuesta(erp.createPosOperation, {
    body: {
      mode: "NORMAL",
      document_kind: "NOTA_X",
      cliente_nombre: "CONSUMIDOR FINAL",
      sucursal_id: branch.id,
      cajero_id: cashier.id,
      punto_venta: 1,
      condicion_pago: "CONTADO",
      subtotal: 1000,
      total: 1000,
      pagos: { EFECTIVO: 1000 },
      items: [item()],
    },
  });
  if (nota.status !== 201 || !nota.payload?.ok) throw new Error(`No se pudo crear la nota: ${JSON.stringify(nota.payload)}`);
  const saleId = nota.payload.operation.saleId;

  /* 1) Sin agente conectado no se encola nada. */
  let r = await conRespuesta(erp.imprimirAgenteOperacion, { params: { id: String(saleId) } });
  if (r.status !== 409) throw new Error(`Esperaba 409 sin agente conectado, obtuve ${r.status}: ${JSON.stringify(r.payload)}`);

  /* 2) El agente consulta (latido) y no hay trabajos todavía. */
  r = await conRespuesta(agente.tomarTrabajos, { headers: { "x-token": TOKEN, "x-plataforma": "test", "x-version": "1.0.0" } });
  if (r.status !== 200 || (r.payload.trabajos || []).length !== 0) throw new Error(`El primer sondeo debía ser vacío: ${JSON.stringify(r.payload)}`);

  /* 3) Ahora el ticket se encola para ese agente. */
  r = await conRespuesta(erp.imprimirAgenteOperacion, { params: { id: String(saleId) } });
  if (r.status !== 200 || !r.payload?.encolado) throw new Error(`El ticket no se encoló: ${JSON.stringify(r.payload)}`);

  /* 4) El agente retira el trabajo: ESC/POS válido y datos de la impresora. */
  r = await conRespuesta(agente.tomarTrabajos, { headers: { "x-token": TOKEN } });
  const trabajos = r.payload?.trabajos || [];
  if (trabajos.length !== 1) throw new Error(`Esperaba 1 trabajo, obtuve ${trabajos.length}.`);
  const trabajo = trabajos[0];
  const buf = Buffer.from(trabajo.datos_base64, "base64");
  const texto = buf.toString("latin1");
  if (!texto.includes("NOTA DE VENTA")) throw new Error("El trabajo no contiene el ticket ESC/POS de la nota de venta.");
  if (trabajo.impresora?.tipo !== "RED" || trabajo.impresora?.host !== "127.0.0.1" || Number(trabajo.impresora?.puerto) !== 9999) {
    throw new Error(`La impresora del trabajo no coincide: ${JSON.stringify(trabajo.impresora)}`);
  }
  if (buf.indexOf(Buffer.from([0x1d, 0x56, 0x00])) < 0) throw new Error("El ticket no trae corte de papel.");

  /* 5) El trabajo tomado no se entrega de nuevo. */
  r = await conRespuesta(agente.tomarTrabajos, { headers: { "x-token": TOKEN } });
  if ((r.payload.trabajos || []).length !== 0) throw new Error("El trabajo tomado no debía entregarse otra vez.");

  /* 6) Resultado del agente: con token ajeno no se puede tocar; con el correcto queda IMPRESO. */
  r = await conRespuesta(agente.resultadoTrabajo, { headers: { "x-token": "otro-token" }, body: { id: trabajo.id, ok: true } });
  if (r.status !== 404) throw new Error(`Un token ajeno no debía poder resolver el trabajo (${r.status}).`);
  r = await conRespuesta(agente.resultadoTrabajo, { headers: { "x-token": TOKEN }, body: { id: trabajo.id, ok: true } });
  if (r.status !== 200) throw new Error(`No se registró el resultado: ${JSON.stringify(r.payload)}`);
  const fila = db.prepare("SELECT estado FROM trabajos_impresion WHERE id=?").get(trabajo.id);
  if (fila.estado !== "IMPRESO") throw new Error(`El trabajo quedó ${fila.estado}, esperaba IMPRESO.`);

  /* 7) Ticket de prueba por el relay. */
  r = await conRespuesta(erp.ticketPruebaAgente, { params: { id: String(pv.id) } });
  if (r.status !== 200 || !r.payload?.encolado) throw new Error(`El ticket de prueba no se encoló: ${JSON.stringify(r.payload)}`);
  r = await conRespuesta(agente.tomarTrabajos, { headers: { "x-token": TOKEN } });
  const prueba = (r.payload.trabajos || [])[0];
  if (!prueba || !Buffer.from(prueba.datos_base64, "base64").toString("latin1").includes("TICKET DE PRUEBA")) {
    throw new Error("El trabajo de prueba no contiene el ticket ESC/POS esperado.");
  }
  await conRespuesta(agente.resultadoTrabajo, { headers: { "x-token": TOKEN }, body: { id: prueba.id, ok: true } });

  /* 8) Estado del agente para el botón "Consultar agente". */
  r = await conRespuesta(erp.estadoAgente, { query: { token: TOKEN } });
  if (!r.payload?.conectado) throw new Error("El agente debía figurar conectado.");
  db.prepare("UPDATE agentes_impresion SET ultima_conexion=datetime('now','-5 minutes') WHERE token=?").run(TOKEN);
  r = await conRespuesta(erp.estadoAgente, { query: { token: TOKEN } });
  if (r.payload?.conectado) throw new Error("Un agente sin latido reciente no debía figurar conectado.");
  r = await conRespuesta(erp.imprimirAgenteOperacion, { params: { id: String(saleId) } });
  if (r.status !== 409) throw new Error("Con el agente caído no se debía encolar (409).");

  console.log("agente-relay: OK — latido, cola de trabajos ESC/POS, datos de impresora, resultado, ticket de prueba y detección de agente caído.");
})();
