const db = require("../../src/db/database");

/*
 * Impresión por agente local: configuración por punto de venta.
 *
 * Modo "NAVEGADOR": imprime como hasta ahora desde el navegador.
 * Modo "AGENTE": el POS manda el ticket ESC/POS al agente que corre en la
 * PC del local (http://127.0.0.1:17777 por defecto), y el agente lo envía
 * a la impresora: por red (IP/puerto) o a la impresora instalada en el
 * sistema (USB u otra).
 */

const cols = db.prepare("PRAGMA table_info(puntos_venta)").all().map((c) => c.name);

const nuevas = [
  ["impresion_modo", "TEXT NOT NULL DEFAULT 'NAVEGADOR'"],
  ["impresora_tipo", "TEXT NOT NULL DEFAULT 'RED'"],
  ["impresora_host", "TEXT DEFAULT ''"],
  ["impresora_puerto", "INTEGER DEFAULT 9100"],
  ["impresora_nombre", "TEXT DEFAULT ''"],
  ["agente_url", "TEXT DEFAULT 'http://127.0.0.1:17777'"],
  ["agente_token", "TEXT DEFAULT ''"],
];

for (const [columna, definicion] of nuevas) {
  if (!cols.includes(columna)) {
    db.exec(`ALTER TABLE puntos_venta ADD COLUMN ${columna} ${definicion}`);
    console.log(`099: puntos_venta.${columna} agregada`);
  }
}

console.log("099: impresión por agente local lista");
