require("dotenv").config();

const initDatabase = require("../../src/db/init");
const { saveProducto } = require("../../src/repositories/producto.repository");

initDatabase();

saveProducto({
  codigo: "505",
  descripcion: "BARRA DE HIERRO NERVADO 6 MM",
  precio: 6900,
  iva: 21,
  unidad: "UNIDAD",
});

saveProducto({
  codigo: "01",
  descripcion: "CEMENTO X 25 KG",
  precio: 7830.01,
  iva: 21,
  unidad: "UNIDAD",
});

console.log("Productos cargados");
