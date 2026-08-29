require("dotenv").config();

const db = require("../../src/db/database");

const API_KEY =
  "caae89b48bffb4b5c3dffd1a85ef5eef55ea3d19686a86c8f9082d14b60f5733";

db.prepare(
  `
  UPDATE empresas
  SET api_key = ?, api_key_activa = 1
  WHERE nombre = ?
`,
).run(API_KEY, "empresa1");

console.log("API Key cargada para empresa1");
