import { Capacitor, registerPlugin } from "@capacitor/core";

type TcpPrinterPlugin = {
  print(options: { host: string; port: number; data: string }): Promise<{ ok: boolean }>;
};

const TcpPrinter = registerPlugin<TcpPrinterPlugin>("TcpPrinter");

export function esAndroidNativo() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function imprimirEscPosRed(host: string, puerto: number, base64: string) {
  if (!esAndroidNativo()) throw new Error("La impresión por red solo está disponible en la app Android.");
  if (!host) throw new Error("Falta configurar la IP de la impresora en el punto de venta.");
  return TcpPrinter.print({ host, port: Number(puerto) || 9100, data: base64 });
}
