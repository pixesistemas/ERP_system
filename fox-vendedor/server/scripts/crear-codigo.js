const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { crearCodigo } = require("../src/db");

function argumento(nombre, defecto = "") {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice >= 0 && process.argv[indice + 1] ? process.argv[indice + 1] : defecto;
}

const nombre = argumento("nombre", "Vendedor");
const dias = Number(argumento("dias", "1")) || 1;
const { codigo, expiraEn } = crearCodigo(nombre, dias);

console.log("Código de acceso de un solo uso");
console.log("--------------------------------");
console.log(`Vendedor: ${nombre}`);
console.log(`Código:   ${codigo}`);
console.log(`Vence:    ${new Date(expiraEn).toLocaleString("es-AR")}`);
console.log("");
console.log("Entregalo al vendedor. Se puede usar una sola vez y deja la sesión iniciada en el celular.");
