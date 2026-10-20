const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/bancos-saldo-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const db = require("../src/db/database");
const erp = require("../src/controllers/erpConsolidation.controller");

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

const empresa = db.prepare("SELECT * FROM empresas WHERE id=1").get();
const bancoId = Number(
  db.prepare("INSERT INTO bancos(empresa_id,nombre,saldo_inicial,activo) VALUES(?,?,0,1)").run(empresa.id, "Billetera Saldo Test").lastInsertRowid,
);

function conRespuesta(fn, body = {}, params = {}) {
  let status = 200;
  let payload = null;
  const req = { empresa: { id: empresa.id }, user: { id: 1, empresaId: empresa.id }, usuario: { id: 1, empresaId: empresa.id }, body, params, query: {} };
  const res = {
    status(v) { status = v; return this; },
    json(v) { payload = v; return v; },
  };
  fn(req, res);
  return { status, payload };
}

const alta = conRespuesta(erp.setBankBalance, { saldo: 5000 }, { id: String(bancoId) });
assert(alta.status === 200 && alta.payload?.ok, `No se pudo fijar el saldo: ${JSON.stringify(alta.payload)}`);
let banco = db.prepare("SELECT b.saldo_inicial,COALESCE((SELECT SUM(CASE WHEN m.tipo='CREDITO' THEN m.importe ELSE -m.importe END) FROM banco_movimientos m WHERE m.banco_id=b.id),0) movimientos FROM bancos b WHERE b.id=?").get(bancoId);
assert(Number(banco.saldo_inicial) === 0 && Number(banco.movimientos) === 5000, "El saldo inicial no se aplicó como movimiento de apertura.");

const ajuste = conRespuesta(erp.setBankBalance, { saldo: 4200 }, { id: String(bancoId) });
assert(ajuste.status === 200 && Number(ajuste.payload?.ajuste) === -800, "El ajuste a la baja no fue de -800.");
banco = db.prepare("SELECT COALESCE((SELECT SUM(CASE WHEN m.tipo='CREDITO' THEN m.importe ELSE -m.importe END) FROM banco_movimientos m WHERE m.banco_id=b.id),0) saldo FROM bancos b WHERE b.id=?").get(bancoId);
assert(Number(banco.saldo) === 4200, `El saldo quedó en ${banco.saldo} en vez de 4200.`);
const movimientos = db.prepare("SELECT tipo,importe FROM banco_movimientos WHERE banco_id=? ORDER BY id").all(bancoId);
assert(movimientos.length === 2 && movimientos[0].tipo === "CREDITO" && movimientos[1].tipo === "DEBITO", "Los movimientos de ajuste no quedaron registrados.");

const sinCambios = conRespuesta(erp.setBankBalance, { saldo: 4200 }, { id: String(bancoId) });
assert(Number(sinCambios.payload?.ajuste) === 0, "Un saldo igual no debe generar movimientos.");
assert(db.prepare("SELECT COUNT(*) n FROM banco_movimientos WHERE banco_id=?").get(bancoId).n === 2, "Se generó un movimiento innecesario.");

console.log("OK bancos: saldo inicial y ajustes se registran como movimientos sin tocar el saldo inicial.");
