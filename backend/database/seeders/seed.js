require("dotenv").config();

const initDatabase = require("../../src/db/init");
const db = require("../../src/db/database");

initDatabase();

db.prepare(
  `
  INSERT INTO empresas (
    nombre, cuit, condicion_iva, punto_venta, production,
    cert_path, key_path, cache_path
  )
  VALUES (
    @nombre, @cuit, @condicion_iva, @punto_venta, @production,
    @cert_path, @key_path, @cache_path
  )
  ON CONFLICT(nombre) DO UPDATE SET
    cuit = excluded.cuit,
    condicion_iva = excluded.condicion_iva,
    punto_venta = excluded.punto_venta,
    production = excluded.production,
    cert_path = excluded.cert_path,
    key_path = excluded.key_path,
    cache_path = excluded.cache_path
`,
).run({
  nombre: "empresa1",
  cuit: "20939802593",
  condicion_iva: "RI",
  punto_venta: 1,
  production: 0,
  cert_path: "src/certificates/empresa1/cert.crt",
  key_path: "src/certificates/empresa1/private.key",
  cache_path: "src/cache/empresa1",
});

console.log("Base creada y empresa1 cargada");
