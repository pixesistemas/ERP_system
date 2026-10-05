/*
 * Fechas en formato argentino (dd/mm/aaaa).
 *
 * Las fechas de la base vienen como "YYYY-MM-DD" (o con hora). Se formatean
 * por texto para evitar el corrimiento de un día por zona horaria.
 */
export function fmtFecha(d: any): string {
  if (d == null || d === "") return "-";
  const texto = typeof d === "string" ? d : "";
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

export function fmtFechaHora(d: any): string {
  if (d == null || d === "") return "-";
  const texto = typeof d === "string" ? d : "";
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}, ${m[4]}:${m[5]}`;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `${fmtFecha(dt)}, ${hh}:${mi}`;
}
