require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("../../src/db/database");

const email = "admin@empresa.com";
const password = "admin123";

const hash = bcrypt.hashSync(password, 10);

db.prepare(
  `
  UPDATE usuarios
  SET password_hash = ?
  WHERE email = ?
`,
).run(hash, email);

console.log("Password actualizado para:", email);
console.log("Password:", password);
