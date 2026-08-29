/*
 * Memoria de los hilos del Asistente WhatsApp (demo).
 *
 * Vive en memoria del módulo: los mensajes de prueba no se pierden al
 * cambiar de pantalla dentro del sistema, pero se recién si se recarga
 * la app (queda así a propósito para el simulador). No usa localStorage
 * ni sessionStorage: ninguna preferencia ni dato de negocio se guarda en
 * el navegador.
 */

type Mensaje = { id: number; de: "cliente" | "bot"; texto: string; hora: string; estado?: string };

const hilos: Record<string, Mensaje[]> = {};

export function demoSaveHilo(telefono: string, mensajes: Mensaje[]) {
  hilos[telefono] = mensajes;
}

export function demoGetHilo(telefono: string): Mensaje[] {
  return hilos[telefono] || [];
}

export function demoBorrarHilo(telefono: string) {
  delete hilos[telefono];
}

export type { Mensaje };
