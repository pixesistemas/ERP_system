const db = require("../../src/db/database");

/*
 * Crea las tablas para agrupar múltiples workspaces
 * dentro de una misma sesión de trabajo del usuario.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS business_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    usuario_id INTEGER,

    nombre TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'ACTIVA',

    canal TEXT NOT NULL DEFAULT 'API',
    telefono_origen TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    closed_at TEXT,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS business_session_workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    session_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,

    orden INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES business_sessions(id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),

    UNIQUE (session_id, workspace_id)
  );

  CREATE INDEX IF NOT EXISTS idx_business_sessions_empresa_usuario
  ON business_sessions (empresa_id, usuario_id, estado);

  CREATE INDEX IF NOT EXISTS idx_session_workspaces_session
  ON business_session_workspaces (session_id, activo);
`);

console.log("Business Sessions: tablas creadas");
