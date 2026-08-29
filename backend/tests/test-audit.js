require("dotenv").config();

const db = require("../src/db/database");

const rows = db
  .prepare(
    `
  SELECT *
  FROM audit_log
  ORDER BY id DESC
  LIMIT 10
`,
  )
  .all();

console.dir(rows, { depth: null });
