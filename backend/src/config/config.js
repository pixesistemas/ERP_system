require("dotenv").config();

module.exports = {
  port: process.env.PORT,

  cuit: process.env.CUIT,

  production: process.env.PRODUCCION === "true",

  certificate: process.env.CERT,

  privateKey: process.env.KEY,

  passphrase: process.env.PASSPHRASE,
};
