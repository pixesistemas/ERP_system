const db = require("../../src/db/database");

/*
 * Crea la tabla que guarda conversaciones comerciales
 * iniciadas desde WhatsApp, React, API, n8n o IA.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,
    telefono TEXT,
    canal TEXT NOT NULL DEFAULT 'API',

    estado TEXT NOT NULL DEFAULT 'IDLE',

    workspace_id INTEGER,
    session_id INTEGER,

    contexto TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,

    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY (session_id) REFERENCES business_sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_empresa_telefono
  ON conversations (empresa_id, telefono, estado);

  CREATE INDEX IF NOT EXISTS idx_conversations_workspace
  ON conversations (workspace_id);
`);

console.log("Conversation Engine: tabla conversations creada");
