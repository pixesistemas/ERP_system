const db = require("../db/database");

/*
 * Catálogo completo de módulos del ERP.
 *
 * - tipo "base": el módulo viene incluido; el superadmin puede desactivarlo
 *   por empresa desde su panel (si no hay fila en modulos_empresa, queda activo).
 * - tipo "opcional": se activa por empresa desde el panel del superadmin.
 *
 * modulosEfectivos() devuelve el estado final (clave -> activo) que se manda
 * en la sesión para que el menú muestre u oculte cada sección.
 */
const MODULOS_SISTEMA = [
  {
    clave: "VENTAS",
    nombre: "Ventas y punto de venta",
    tipo: "base",
    descripcion:
      "POS completo: factura electrónica ARCA, nota de venta, presupuestos, notas de pedido, reservas, remitos, historial de ventas y vendedores con comisiones.",
  },
  {
    clave: "PRODUCTOS",
    nombre: "Productos y precios",
    tipo: "base",
    descripcion:
      "Catálogo de productos, rubros/subrubros/marcas, unidades de medida, actualización masiva de precios, importación y precios de góndola.",
  },
  {
    clave: "STOCK",
    nombre: "Stock e inventario",
    tipo: "base",
    descripcion:
      "Inventario por depósito, movimientos, transferencias entre sucursales, stock por sucursal, combos, descuentos por cantidad, promociones y cupones de sorteo.",
  },
  {
    clave: "CLIENTES",
    nombre: "Clientes",
    tipo: "base",
    descripcion:
      "Alta y edición de clientes con documentos, condición de IVA, descuento, ubicación y datos de contacto.",
  },
  {
    clave: "COMPRAS",
    nombre: "Compras y proveedores",
    tipo: "base",
    descripcion:
      "Proveedores, carga de comprobantes de compra con IVA, percepciones y retenciones, e importación del archivo de AFIP.",
  },
  {
    clave: "IVA",
    nombre: "Libro IVA",
    tipo: "base",
    descripcion: "Libro IVA compras/ventas y borrador de IVA para el contador.",
  },
  {
    clave: "TESORERIA",
    nombre: "Caja y tesorería",
    tipo: "base",
    descripcion:
      "Caja y cierres, cuentas corrientes de clientes, recibos de cobro, cheques y depósitos, liquidación de tarjetas, bancos y conciliación bancaria, órdenes de pago y monedas.",
  },
  {
    clave: "REPORTES",
    nombre: "Reportes",
    tipo: "base",
    descripcion:
      "Reportes de ventas, compras, stock, caja, cuenta corriente y pedidos dinámicos, con exportación a PDF, Excel y CSV.",
  },
  {
    clave: "WHATSAPP",
    nombre: "WhatsApp y asistentes",
    tipo: "base",
    descripcion:
      "Bandeja de WhatsApp, pedidos de clientes por WhatsApp, número autorizados y asistentes conversacionales (web y empleados).",
  },
  {
    clave: "CONFIGURACION",
    nombre: "Configuración y usuarios",
    tipo: "base",
    descripcion:
      "Empresa, sucursales, cajeros, puntos de venta, diseño e impresión de comprobantes, usuarios y roles con permisos por pantalla, y configuración general.",
  },
  {
    clave: "PREVENTA_MOVIL",
    nombre: "Pedidos móviles + reparto",
    tipo: "opcional",
    descripcion:
      "App del vendedor y del repartidor, bandeja de pedidos, rutas de reparto con mapa, cartera de clientes por vendedor, anular pedidos, devoluciones de reparto y reportes de vendedores.",
  },
  {
    clave: "POS_SIMPLE",
    nombre: "POS simplificado",
    tipo: "opcional",
    descripcion:
      "Deja en el punto de venta solo facturar y nota de venta: esconde presupuestos, reservas, remitos y notas de pedido.",
  },
  {
    clave: "COMPRAS_MOVIL",
    nombre: "App de compras",
    tipo: "opcional",
    descripcion:
      "App del celular para cargar facturas de proveedores con foto (OCR), recepción de facturas por WhatsApp y revisión en el escritorio.",
  },
  {
    clave: "ARCA_API",
    nombre: "API ARCA para sistemas externos",
    tipo: "opcional",
    descripcion:
      "Permite que otro sistema (por ejemplo un programa en FoxPro) emita facturas, notas de crédito y débito usando los certificados de esta empresa.",
  },
  {
    clave: "COBRO_TEMPORAL",
    nombre: "Cobro temporal",
    tipo: "opcional",
    descripcion: "Pantalla de cobro rápido temporal para caja.",
  },
];

function modulosEfectivos(empresaId) {
  const id = Number(empresaId);
  const rows = id
    ? db
        .prepare("SELECT modulo,activo FROM modulos_empresa WHERE empresa_id=?")
        .all(id)
    : [];
  const estado = new Map(
    rows.map((r) => [String(r.modulo || "").trim().toUpperCase(), Number(r.activo) === 1]),
  );
  const resultado = {};
  for (const modulo of MODULOS_SISTEMA) {
    const guardado = estado.get(modulo.clave);
    resultado[modulo.clave] =
      modulo.tipo === "base" ? (guardado == null ? true : guardado) : Boolean(guardado);
  }
  /* Claves fuera del catálogo (compatibilidad con módulos viejos). */
  for (const [clave, activo] of estado) {
    if (!(clave in resultado)) resultado[clave] = activo;
  }
  return resultado;
}

module.exports = { MODULOS_SISTEMA, modulosEfectivos };
