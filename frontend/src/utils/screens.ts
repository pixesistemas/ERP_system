// Todas las pantallas del ERP que se pueden habilitar/deshabilitar por rol,
// agrupadas igual que las secciones del menú lateral. "dashboard" y "chat"
// no están acá: son pantallas base que siempre puede ver cualquier usuario
// logueado.
export const SCREEN_SECTIONS: { section: string; screens: { key: string; label: string }[] }[] = [
  {
    section: "VENTAS",
    screens: [
      { key: "pos", label: "Punto de venta" },
      { key: "sales", label: "Historial de ventas" },
      { key: "documents", label: "Comprobantes" },
      { key: "budgets", label: "Presupuestos" },
      { key: "sales-notes", label: "Notas de venta" },
      { key: "reservations", label: "Reservas" },
      { key: "reserve-funds", label: "Reservas por monto" },
      { key: "orders", label: "Notas de pedido" },
      { key: "remitos", label: "Remitos" },
    ],
  },
  {
    section: "GESTIÓN",
    screens: [
      { key: "products", label: "Productos" },
      { key: "categories", label: "Rubros, subrubros y marcas" },
      { key: "units", label: "Unidades de medida" },
      { key: "price-update", label: "Actualización de precios" },
      { key: "imports", label: "Importar productos" },
      { key: "shelf-labels", label: "Precios de góndola" },
      { key: "stock", label: "Inventario" },
      { key: "stock-moves", label: "Movimientos de stock" },
      { key: "stock-transfers", label: "Transferencias entre sucursales" },
      { key: "branch-stock", label: "Stock por sucursal" },
      { key: "combos", label: "Combos" },
      { key: "quantity-discounts", label: "Descuentos por cantidad" },
      { key: "promotions", label: "Promociones y regalos" },
      { key: "raffles", label: "Cupones de sorteo" },
      { key: "clients", label: "Clientes" },
      { key: "suppliers", label: "Proveedores" },
      { key: "product-suppliers", label: "Proveedores por producto" },
      { key: "purchases", label: "Compras" },
      { key: "vat-books", label: "Libro IVA" },
      { key: "borrador-iva", label: "Borrador IVA" },
      { key: "sellers", label: "Vendedores y comisiones" },
    ],
  },
  {
    section: "FINANZAS",
    screens: [
      { key: "cash", label: "Caja" },
      { key: "accounts", label: "Cuentas clientes" },
      { key: "receipts", label: "Recibos de cobro" },
      { key: "checks", label: "Cheques" },
      { key: "cards", label: "Liquidación tarjetas" },
      { key: "bank-list", label: "Bancos" },
      { key: "banks", label: "Conciliación bancaria" },
      { key: "payment-orders", label: "Órdenes de pago" },
      { key: "cash-closures", label: "Cierres de caja" },
      { key: "currencies", label: "Monedas y cotizaciones" },
      { key: "check-deposits", label: "Depósito de cheques" },
    ],
  },
  {
    section: "CONFIGURACIÓN",
    screens: [
      { key: "reports", label: "Reportes" },
      { key: "dynamic-orders-report", label: "Pedidos dinámicos" },
      { key: "branches", label: "Sucursales" },
      { key: "cashiers", label: "Cajeros" },
      { key: "point-sales", label: "Puntos de venta" },
      { key: "pos-comprobantes", label: "Comprobantes" },
      { key: "document-designer", label: "Diseñador de comprobantes" },
      { key: "company", label: "Empresa" },
      { key: "whatsapp-auth", label: "WhatsApp autorizados" },
      { key: "whatsapp-orders", label: "Pedidos por WhatsApp" },
      { key: "settings", label: "Configuración" },
      { key: "users", label: "Usuarios" },
      { key: "roles", label: "Roles y permisos" },
      { key: "novedades", label: "Novedades del sistema" },
      { key: "whatsapp-tray", label: "Bandeja WhatsApp" },
    ],
  },
];

export const ALL_SCREEN_KEYS = SCREEN_SECTIONS.flatMap((s) => s.screens.map((x) => x.key));

export function canSeeScreen(pantallas: string[] | null, key: string): boolean {
  if (key === "dashboard" || key === "chat") return true;
  if (!pantallas) return true;
  return pantallas.includes(key);
}
