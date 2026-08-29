require("dotenv").config();

const {
  getEmpresaByNombre,
} = require("../src/repositories/empresa.repository");
const {
  listVendedoresByEmpresa,
} = require("../src/repositories/vendedor.repository");

const empresa = getEmpresaByNombre("empresa1");

console.log(listVendedoresByEmpresa(empresa.id));
