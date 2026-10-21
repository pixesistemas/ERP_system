const db = require("../../src/db/database");

/*
 * Acceso de vendedores desde el celular:
 * - vendedor_codigos: códigos de un solo uso para iniciar sesión.
 * - vendedor_tokens: tokens de dispositivo de larga duración. Son opacos y
 *   solo sirven para las rutas /api/v1/vendedor, no para el resto del ERP.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS vendedor_codigos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    codigo_hash TEXT NOT NULL UNIQUE,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en TEXT NOT NULL,
    usado_en TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_vendedor_codigos_hash ON vendedor_codigos(codigo_hash);

  CREATE TABLE IF NOT EXISTS vendedor_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso TEXT,
    expira_en TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_vendedor_tokens_hash ON vendedor_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_vendedor_tokens_usuario ON vendedor_tokens(usuario_id);
`);

console.log("102: acceso móvil de vendedores listo");
