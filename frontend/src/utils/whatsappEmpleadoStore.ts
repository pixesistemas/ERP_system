/*
 * Memoria de los hilos del Asistente WhatsApp para empleados (demo).
 * Mismo criterio que whatsappDemoStore: vive en memoria del módulo y no
 * usa localStorage ni sessionStorage.
 */

import type { Mensaje } from "./whatsappDemoStore";

const hilos: Record<string, Mensaje[]> = {};

let entradaPendiente: string | null = null;

export function empleadoSaveHilo(telefono: string, mensajes: Mensaje[]) {
  hilos[telefono] = mensajes;
}

export function empleadoGetHilo(telefono: string): Mensaje[] {
  return hilos[telefono] || [];
}

export function empleadoBorrarHilo(telefono: string) {
  delete hilos[telefono];
}

export function empleadoEncolarMensaje(texto: string) {
  entradaPendiente = texto;
}

export function empleadoDesencolarMensaje(): string | null {
  const texto = entradaPendiente;
  entradaPendiente = null;
  return texto;
}
