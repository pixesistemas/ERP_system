const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const rutaConfigurada = process.env.DB_PATH || "data/fox-vendedor.db";
const rutaDb = path.isAbsolute(rutaConfigurada)
  ? rutaConfigurada
  : path.resolve(path.join(__dirname, ".."), rutaConfigurada);
fs.mkdirSync(path.dirname(rutaDb), { recursive: true });

const db = new Database(rutaDb);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS articulos (
  idart INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL DEFAULT '',
  codbarra TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT '',
  unidad TEXT NOT NULL DEFAULT '',
  stock REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 0,
  pfinal1 REAL NOT NULL DEFAULT 0,
  pfinal2 REAL NOT NULL DEFAULT 0,
  pfinal3 REAL NOT NULL DEFAULT 0,
  pfinal4 REAL NOT NULL DEFAULT 0,
  idrubro INTEGER NOT NULL DEFAULT 0,
  idmarca INTEGER NOT NULL DEFAULT 0,
  actualizado_fox TEXT NOT NULL DEFAULT '',
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_articulos_codigo ON articulos(codigo);
CREATE INDEX IF NOT EXISTS idx_articulos_barra ON articulos(codbarra);
CREATE INDEX IF NOT EXISTS idx_articulos_desc ON articulos(descripcion);

CREATE TABLE IF NOT EXISTS codigos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_hash TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL,
  expira_en TEXT NOT NULL,
  usado_en TEXT
);

CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  ultimo_uso TEXT,
  expira_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presupuestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id INTEGER NOT NULL,
  vendedor TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  observaciones TEXT NOT NULL DEFAULT '',
  lista_precio INTEGER NOT NULL DEFAULT 1,
  subtotal REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  fox_idcompro INTEGER,
  fox_numero INTEGER,
  error_sync TEXT,
  creado_en TEXT NOT NULL,
  sincronizado_en TEXT,
  FOREIGN KEY (token_id) REFERENCES tokens(id)
);
CREATE INDEX IF NOT EXISTS idx_presupuestos_estado ON presupuestos(estado);
CREATE INDEX IF NOT EXISTS idx_presupuestos_token ON presupuestos(token_id);

CREATE TABLE IF NOT EXISTS presupuesto_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  presupuesto_id INTEGER NOT NULL,
  idart INTEGER NOT NULL,
  codigo TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL,
  cantidad REAL NOT NULL,
  puni REAL NOT NULL,
  descuento REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 0,
  neto REAL NOT NULL DEFAULT 0,
  iva_importe REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  idrubro INTEGER NOT NULL DEFAULT 0,
  unidad TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL
);
`);

function ahora() {
  return new Date().toISOString();
}

function sumarDias(dias) {
  return new Date(Date.now() + Math.max(1, Number(dias) || 1) * 86400000).toISOString();
}

function hash(texto) {
  return crypto.createHash("sha256").update(String(texto)).digest("hex");
}

function crearCodigo(nombre = "", dias = 1) {
  const codigo = String(crypto.randomInt(0, 100000000)).padStart(8, "0");
  db.prepare(
    "INSERT INTO codigos(codigo_hash,nombre,creado_en,expira_en) VALUES(?,?,?,?)",
  ).run(hash(codigo), String(nombre || "").slice(0, 120), ahora(), sumarDias(dias));
  return { codigo, expiraEn: sumarDias(dias) };
}

function crearToken(nombre = "", dias = 365) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO tokens(token_hash,nombre,creado_en,expira_en) VALUES(?,?,?,?)",
  ).run(hash(token), String(nombre || "").slice(0, 120), ahora(), sumarDias(dias));
  return { token, expiraEn: sumarDias(dias) };
}

const canjearCodigoTx = db.transaction((codigo, nombre, dias) => {
  const fila = db
    .prepare("SELECT * FROM codigos WHERE codigo_hash=? AND usado_en IS NULL")
    .get(hash(codigo));
  if (!fila) return null;
  if (new Date(fila.expira_en).getTime() < Date.now()) return null;
  db.prepare("UPDATE codigos SET usado_en=? WHERE id=?").run(ahora(), fila.id);
  const resultado = crearToken(nombre || fila.nombre, dias);
  return { ...resultado, nombre: nombre || fila.nombre };
});

function canjearCodigo(codigo, nombre = "", dias = 365) {
  return canjearCodigoTx(String(codigo || "").trim(), nombre, dias);
}

const verificarTokenTx = db.transaction((token) => {
  const fila = db
    .prepare("SELECT * FROM tokens WHERE token_hash=? AND activo=1")
    .get(hash(token));
  if (!fila) return null;
  if (new Date(fila.expira_en).getTime() < Date.now()) return null;
  db.prepare("UPDATE tokens SET ultimo_uso=? WHERE id=?").run(ahora(), fila.id);
  return { id: fila.id, nombre: fila.nombre, expiraEn: fila.expira_en };
});

function verificarToken(token) {
  if (!token) return null;
  return verificarTokenTx(token);
}

function registrarSync(tipo, detalle) {
  db.prepare("INSERT INTO sync_log(tipo,detalle,creado_en) VALUES(?,?,?)").run(
    String(tipo),
    String(detalle || "").slice(0, 500),
    ahora(),
  );
}

module.exports = {
  db,
  rutaDb,
  ahora,
  crearCodigo,
  canjearCodigo,
  verificarToken,
  registrarSync,
};
