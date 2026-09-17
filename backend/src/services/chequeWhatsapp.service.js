const db = require("../db/database");

/*
 * Alta de cheques por WhatsApp para números autorizados de la empresa.
 *
 * Formato recomendado:
 *   cheque numero 12345678 importe 150000 vence 30/11/2026 banco Macro librador Juan Perez
 *
 * También acepta variantes: nro/n°, monto, vencimiento, emisión.
 */

function soloDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function esTelefonoAutorizado(empresaId, telefono) {
  const from = soloDigitos(telefono);
  if (!from) return false;
  const filas = db
    .prepare("SELECT telefono FROM whatsapp_autorizados WHERE empresa_id=?")
    .all(empresaId);
  return filas.some((f) => {
    const autorizado = soloDigitos(f.telefono);
    if (!autorizado) return false;
    return from.endsWith(autorizado) || autorizado.endsWith(from);
  });
}

function fechaIso(valor) {
  const texto = String(valor || "").trim();
  const ar = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (ar) {
    const anio = ar[3].length === 2 ? `20${ar[3]}` : ar[3];
    return `${anio}-${ar[2].padStart(2, "0")}-${ar[1].padStart(2, "0")}`;
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function numeroImporte(valor) {
  const limpio = String(valor || "").replace(/[^\d.,-]/g, "");
  if (!limpio) return 0;
  const normalizado = limpio.includes(",")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio;
  return Number(normalizado) || 0;
}

function extraer(texto, claves) {
  for (const clave of claves) {
    const re = new RegExp(
      `${clave}\\s*[:=]?\\s*([\\d.,/-]+|[^,;]+?)(?=\\s+(?:numero|nro|n°|banco|importe|monto|vence|vencimiento|emision|librador)\\b|$)`,
      "i",
    );
    const m = texto.match(re);
    if (m && String(m[1] || "").trim()) return String(m[1]).trim();
  }
  return "";
}

function procesarCheque({ empresaId, texto }) {
  const ayuda =
    "Para cargar un cheque escribí: *cheque numero 12345678 importe 150000 vence 30/11/2026 banco Macro librador Juan Perez*. " +
    "Importe y número son obligatorios.";

  const cuerpo = String(texto || "").replace(/^\s*cheque\s*/i, "").trim();
  if (!cuerpo) return { ok: false, mensaje: ayuda };

  const numero = extraer(cuerpo, ["numero", "nro", "n°"]);
  const importeTexto = extraer(cuerpo, ["importe", "monto"]);
  const vencimientoTexto = extraer(cuerpo, ["vence", "vencimiento"]);
  const banco = extraer(cuerpo, ["banco"]);
  const librador = extraer(cuerpo, ["librador"]);

  let numeroFinal = numero;
  let importe = numeroImporte(importeTexto);
  let vencimiento = fechaIso(vencimientoTexto);

  if (!numeroFinal || !importe) {
    const numeros = cuerpo.match(/\d[\d.,]*/g) || [];
    const fechas = cuerpo.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/g) || [];
    if (!vencimiento && fechas.length) vencimiento = fechaIso(fechas[0]);
    const candidatos = numeros.filter((n) => !fechas.includes(n));
    if (!numeroFinal && candidatos.length) numeroFinal = candidatos.shift();
    if (!importe && candidatos.length) {
      const montos = candidatos.map(numeroImporte).filter((n) => n > 0);
      importe = montos.length ? Math.max(...montos) : 0;
    }
  }

  if (!numeroFinal || !importe) return { ok: false, mensaje: ayuda };

  const info = db
    .prepare(
      `INSERT INTO cheques(empresa_id,numero,banco_origen,librador,importe,fecha_emision,fecha_vencimiento,estado)
       VALUES(?,?,?,?,?,?,?,'EN_CARTERA')`,
    )
    .run(
      empresaId,
      String(numeroFinal).trim(),
      banco || "",
      librador || "",
      importe,
      new Date().toISOString().slice(0, 10),
      vencimiento || null,
    );

  const cheque = db
    .prepare("SELECT * FROM cheques WHERE id=?")
    .get(info.lastInsertRowid);

  const detalle = [
    `N° ${cheque.numero}`,
    `importe $ ${Number(cheque.importe).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
    cheque.banco_origen ? `banco ${cheque.banco_origen}` : "",
    cheque.fecha_vencimiento ? `vence ${cheque.fecha_vencimiento}` : "",
    cheque.librador ? `librador ${cheque.librador}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    ok: true,
    cheque,
    mensaje: `Cheque registrado en cartera: ${detalle}.`,
  };
}

module.exports = { procesarCheque, esTelefonoAutorizado };
