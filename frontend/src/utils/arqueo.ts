/*
 * Cálculos de arqueo de caja.
 *
 * El efectivo esperado sale de los movimientos del turno (apertura, ventas,
 * ingresos y egresos de efectivo). El resto de los medios (tarjeta,
 * transferencia, QR, cheque) se toma del sistema. La diferencia es contra
 * el efectivo contado por el cajero.
 */

export function efectivoDeMedios(medios: any): number {
  if (!medios || typeof medios !== "object") return 0;
  const clave = Object.keys(medios).find((k) => k.toLowerCase() === "efectivo");
  return clave ? Number(medios[clave] || 0) : 0;
}

export function calcularArqueo(detail: any) {
  const saldo = Number(detail?.session?.saldo_teorico || 0);
  const efectivoTeorico =
    Math.round(
      (detail?.movements || []).reduce(
        (n: number, m: any) => n + efectivoDeMedios(m.medios) * (Number(m.importe) < 0 ? -1 : 1),
        0,
      ) * 100,
    ) / 100;
  const otros = Math.round((saldo - efectivoTeorico) * 100) / 100;
  return { saldo, efectivoTeorico, otros };
}

export function arqueoConContado(detail: any, efectivoContado: any) {
  const base = calcularArqueo(detail);
  const efectivo = Number(String(efectivoContado ?? "").replace(",", ".")) || 0;
  const total = Math.round((efectivo + base.otros) * 100) / 100;
  const diferencia = Math.round((total - base.saldo) * 100) / 100;
  return { ...base, efectivo, total, diferencia };
}
