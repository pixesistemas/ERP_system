/*
 * Lista canónica de pantallas asignables por rol. Debe mantenerse
 * sincronizada con frontend/src/utils/screens.ts (SCREEN_SECTIONS).
 *
 * Se usa para registrar cada pantalla con su fecha de alta: cuando se
 * agrega una pantalla nueva al sistema, `reconciliarPantallas()` la suma
 * automáticamente a los roles que ya tenían una lista explícita (sin
 * reactivar las que el administrador haya desmarcado a propósito).
 *
 * IMPORTANTE: al agregar una pantalla en screens.ts, agregarla también acá.
 */
const PANTALLAS = [
  // VENTAS
  "pos",
  "sales",
  "documents",
  "budgets",
  "sales-notes",
  "reservations",
  "reserve-funds",
  "orders",
  "remitos",
  // GESTIÓN
  "products",
  "categories",
  "units",
  "price-update",
  "imports",
  "shelf-labels",
  "stock",
  "stock-moves",
  "stock-transfers",
  "branch-stock",
  "combos",
  "quantity-discounts",
  "promotions",
  "raffles",
  "clients",
  "suppliers",
  "product-suppliers",
  "purchases",
  "vat-books",
  "borrador-iva",
  "sellers",
  // FINANZAS
  "cash",
  "accounts",
  "receipts",
  "checks",
  "cards",
  "bank-list",
  "banks",
  "payment-orders",
  "cash-closures",
  "currencies",
  "check-deposits",
  // CONFIGURACIÓN
  "reports",
  "sales-reports",
  "dynamic-orders-report",
  "branches",
  "cashiers",
  "point-sales",
  "pos-comprobantes",
  "document-designer",
  "company",
  "whatsapp-auth",
  "whatsapp-orders",
  "settings",
  "users",
  "roles",
  "novedades",
  "whatsapp-tray",
];

module.exports = { PANTALLAS };
