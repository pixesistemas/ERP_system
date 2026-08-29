require("dotenv").config();

const initDatabase = require("../src/db/init");
const {
  saveCliente,
  getClienteByCuit,
} = require("../src/repositories/cliente.repository");

initDatabase();

saveCliente({
  cuit: "20333170818",
  razonSocial: "CLIENTE PRUEBA",
  condicionIVA: "RI",
  domicilio: "SIN DIRECCION",
});

const cliente = getClienteByCuit("20333170818");

console.log(cliente);
