require("dotenv").config();

const db = require("../src/db/database");

const rows = db
  .prepare(
    `
  SELECT *
  FROM facturas
  ORDER BY id DESC
  LIMIT 5
`,
  )
  .all();

console.dir(rows, { depth: null });
