require("dotenv").config();

const db = require("../../src/db/database");
const {
  getEmpresaByNombre,
} = require("../../src/repositories/empresa.repository");

const empresa = getEmpresaByNombre("empresa1");

db.prepare(
  `
  INSERT OR IGNORE INTO depositos (
    empresa_id, nombre, activo
  )
  VALUES (?, 'Depósito Principal', 1)
`,
).run(empresa.id);

console.log("Depósito principal creado");
