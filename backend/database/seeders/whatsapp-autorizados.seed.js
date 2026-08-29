require("dotenv").config();

const {
  getEmpresaByNombre,
} = require("../../src/repositories/empresa.repository");
const {
  saveTelefonoAutorizado,
} = require("../../src/repositories/whatsapp.repository");

const empresa = getEmpresaByNombre("empresa1");

saveTelefonoAutorizado({
  empresaId: empresa.id,
  telefono: "5493454109731",
  nombre: "Administrador",
  rol: "ADMIN",
});

console.log("WhatsApp autorizado cargado");
