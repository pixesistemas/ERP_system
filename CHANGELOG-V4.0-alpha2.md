# V4.0 Alpha 2 - Compras, IVA, reservas y plantillas

## Consolidado en SQLite/API
- Compras y gastos con período IVA, proveedor, comprobante, moneda, condición de pago, alícuotas múltiples y retenciones/percepciones.
- Libro IVA Ventas/Compras por mes y año con débito fiscal, crédito fiscal y saldo.
- Reservas por monto con cliente obligatorio, saldo y snapshot de precios.
- Consumo de reserva por monto desde el POS usando los precios congelados.

## Interfaz
- Compras deja de depender de localStorage.
- Libro IVA deja de depender de documentos locales.
- Selector mensual/anual.
- Diseñador muestra como referencia las plantillas PDF reales de factura, presupuesto y remito.

## Pendiente de la siguiente alpha
- Persistir la venta completa del POS en SQLite (todavía conserva parte de su flujo local).
- Editor visual drag-and-drop del comprobante; Alpha 2 usa las plantillas oficiales como base visual fija.
- Retenciones/percepciones con catálogos y jurisdicciones completas.
