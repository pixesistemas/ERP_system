require("dotenv").config();

const db = require("../src/db/database");

const row = db
  .prepare(
    `
  SELECT id, nombre, api_key, api_key_activa, activa
  FROM empresas
  WHERE nombre = 'empresa1'
`,
  )
  .get();

console.log(row);
