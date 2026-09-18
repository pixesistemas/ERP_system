function pad(n) { return String(n).padStart(2, "0"); }

/*
 * Zona horaria de la empresa. Se usa Argentina por defecto para que las
 * horas sean las mismas aunque el servidor (Docker) esté en UTC.
 */
const TIME_ZONE = process.env.TZ_APP || process.env.TZ || "America/Argentina/Buenos_Aires";

function partesEnZona(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const partes = {};
  for (const p of fmt.formatToParts(date)) partes[p.type] = p.value;
  if (partes.hour === "24") partes.hour = "00";
  return partes;
}

function nowLocal(date = new Date()) {
  const p = partesEnZona(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function todayLocal(date = new Date()) {
  const p = partesEnZona(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/*
 * Convierte un timestamp guardado por SQLite con CURRENT_TIMESTAMP (UTC)
 * a la hora local de la empresa, en formato "YYYY-MM-DD HH:MM:SS".
 */
function fromUtcSql(value) {
  if (!value) return value;
  const texto = String(value).trim().replace(" ", "T");
  const conZona = /Z$|[+-]\d{2}:?\d{2}$/.test(texto) ? texto : `${texto}Z`;
  const date = new Date(conZona);
  if (Number.isNaN(date.getTime())) return value;
  return nowLocal(date);
}

module.exports = { nowLocal, todayLocal, fromUtcSql, pad, TIME_ZONE };
