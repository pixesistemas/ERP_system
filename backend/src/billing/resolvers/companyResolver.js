const { getEmpresaByNombre } = require("../../repositories/empresa.repository");
const Empresa = require("../../domain/Empresa");

class CompanyResolver {
  resolve(nombreEmpresa) {
    const empresaData = getEmpresaByNombre(nombreEmpresa || "empresa1");
    return new Empresa(empresaData);
  }
}

module.exports = CompanyResolver;
