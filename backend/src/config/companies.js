const path = require("path");

module.exports = {
  empresa1: {
    cuit: "20939802593",

    production: false,

    cert: path.join(__dirname, "../certificates/empresa1/cert.crt"),

    key: path.join(__dirname, "../certificates/empresa1/private.key"),

    cache: path.join(__dirname, "../cache/empresa1"),
  },
};
