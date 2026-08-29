# V4.0 Beta 2

Versión de consolidación basada íntegramente en V4.0 Beta 1.3. Conserva los módulos existentes y reemplaza `app_state` por tablas normalizadas en los circuitos definidos para esta etapa.

## Normalización

- Proveedores, monedas, rubros de gasto y condiciones de pago.
- Tipos de percepciones y retenciones.
- Vendedores/comisiones, sucursales, cajeros y puntos de venta.
- Bancos, cheques, descuentos, promociones, combos y sus artículos.
- Perfil/configuración de empresa y diseñador de comprobantes.

La migración `032-normalize-beta2.js` crea las tablas, amplía el arqueo de caja e importa datos compatibles de `app_state` al actualizar una base Beta 1.3.

## Circuito financiero

- Apertura de caja por sucursal y cajero, movimientos, arqueo y cierre.
- Cheques del POS y del CRUD en una sola cartera SQLite.
- Depósito transaccional de uno o varios cheques y conciliación.
- Órdenes de pago con efectivo, transferencia y múltiples cheques.

## Calidad

- `npm run test:beta2`
- `npm run audit:normalized`
- `npm run audit:no-local-storage`
- Build Vite verificado.

