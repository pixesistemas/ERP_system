# V4.0 Beta 1 — Núcleo comercial consolidado

Esta versión parte de **V4.0 Alpha 3 completa** y conserva sus módulos, pantallas, Compras/IVA, reservas por monto y diseñador de comprobantes.

## Persistencia real agregada

- Operaciones del Punto de Venta en SQLite.
- Ítems y medios de pago por venta.
- Comprobante comercial relacionado.
- Numeración independiente por empresa, punto de venta y tipo.
- Sesiones de caja por sucursal y cajero.
- Movimientos de caja asociados a la venta.
- Cheques recibidos en el POS guardados en la cartera real.
- Descuento de stock y movimiento `SALIDA_VENTA`.
- Consumo transaccional de reservas por monto.
- Catálogos reales de sucursales, cajeros, vendedores y puntos de venta.

## Frontend

- Las cuatro pestañas de Venta 1–4 siguen siendo borradores locales, para no perder una venta en preparación.
- Al confirmar, la operación deja de guardarse en `afip_pos_documents`, `afip_cash_movements` y `afip_checks_v30`.
- El cierre de caja consulta sesiones y movimientos desde la API.
- Se restauraron módulos visuales de Alpha 3 que habían quedado referenciados pero sin su componente en el archivo final.

## Pendiente de Beta 2/Beta 3

- Migrar proveedores, órdenes de pago, promociones, combos, sucursales y cajeros CRUD del frontend a API.
- Emisión WSFE/ARCA definitiva y CAE desde el cierre del POS.
- PDF fiscal final desde las plantillas oficiales.
- Reportes exclusivamente basados en el backend.
