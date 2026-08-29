require("dotenv").config();

const db = require("../src/db/database");

const events = db
  .prepare(
    `
  SELECT *
  FROM event_store
  ORDER BY id DESC
  LIMIT 10
`,
  )
  .all();

console.dir(events, { depth: null });
