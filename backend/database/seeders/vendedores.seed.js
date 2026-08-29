require("dotenv").config();

const {
  getEmpresaByNombre,
} = require("../../src/repositories/empresa.repository");
const { saveVendedor } = require("../../src/repositories/vendedor.repository");

const empresa = getEmpresaByNombre("empresa1");

const vendedor = saveVendedor({
  empresaId: empresa.id,
  nombre: "Vendedor Principal",
  telefono: "3450000000",
  email: "vendedor@empresa.com",
  comisionPorcentaje: 3,
});

console.log("Vendedor creado:", vendedor);
