require("dotenv").config();

const {
  getEmpresaByNombre,
} = require("../../src/repositories/empresa.repository");
const {
  crearRegla,
} = require("../../src/repositories/businessRule.repository");

const empresa = getEmpresaByNombre("empresa1");

const regla = crearRegla({
  empresaId: empresa.id,
  nombre: "Bloquear cuenta corriente con deuda mayor a 50000",
  evento: "ANTES_FACTURAR_CTA_CTE",
  condicion: {
    tipo: "CLIENTE_DEUDA_MAYOR_A",
    valor: 50000,
  },
  accion: {
    tipo: "BLOQUEAR",
    mensaje:
      "Cliente con deuda mayor a $50.000. No se permite facturar en cuenta corriente.",
  },
});

console.log("Regla creada:", regla);
