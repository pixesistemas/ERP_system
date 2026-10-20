const fs = require("fs");
const path = require("path");

const testDb = path.join(__dirname, "../data/configuracion-empresa-test.db");
process.env.DB_PATH = testDb;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDb + suffix, { force: true });

const bootstrap = require("../src/db/bootstrap");
bootstrap();
const settingsRepo = require("../src/repositories/companySettings.repository");

function assert(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

const empresaId = 1;
const inicial = settingsRepo.getSettings(empresaId);
assert(inicial.preguntarFondoInicial === false, "El fondo inicial debe venir apagado por defecto.");
assert(inicial.requireCashierOnStart === false, "Solicitar cajero debe venir apagado por defecto.");

settingsRepo.saveSettings(empresaId, {
  preguntarFondoInicial: true,
  requireCashierOnStart: true,
  bancoBilleteraId: 2,
  bancoQrId: 3,
});

const guardada = settingsRepo.getSettings(empresaId);
assert(guardada.preguntarFondoInicial === true, "No se guardó 'preguntar fondo inicial'.");
assert(guardada.requireCashierOnStart === true, "No se guardó 'solicitar cajero al iniciar'.");
assert(Number(guardada.bancoBilleteraId) === 2, "No se guardó el banco de billetera.");
assert(Number(guardada.bancoQrId) === 3, "No se guardó el banco del QR.");

settingsRepo.saveSettings(empresaId, { preguntarFondoInicial: false });
const desactivada = settingsRepo.getSettings(empresaId);
assert(desactivada.preguntarFondoInicial === false, "No se pudo desactivar el fondo inicial.");
assert(desactivada.requireCashierOnStart === true, "Se perdió 'solicitar cajero' al guardar otro campo.");

console.log("OK configuración: fondo inicial, solicitud de cajero y bancos se guardan y se leen.");
