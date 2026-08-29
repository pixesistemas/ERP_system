# Contexto del ERP AFIP Conversacional

## Versión base

V4.0 Beta 2.1. La aplicación es una demo consolidada con frontend React/TypeScript, backend Node.js/Express y SQLite. La migración futura a MySQL debe conservar servicios, reglas y contratos de API.

## Objetivo

Unificar en un solo sistema:

- Punto de venta con operación intensiva por teclado.
- Administración comercial, stock, caja, bancos, cheques y cuentas corrientes.
- Facturación electrónica ARCA.
- Asistente conversacional compartido por web, n8n y WhatsApp.

## Reglas comerciales vigentes

- El POS ofrece `CONTADO` y `CUENTA CORRIENTE`.
- Contado registra medios de cobro y caja.
- Factura o Nota X en cuenta corriente debita el importe completo al cliente y no mueve caja.
- Presupuestos, reservas y notas de pedido no descuentan stock.
- Una reserva por monto congela los precios de la fecha de creación y se retira mediante remito.
- Los borradores Venta 1–4 persisten por empresa y usuario.
- Cada punto de venta configura impresión A4 o ticket de 80 mm.
- Los datos comerciales no se guardan en el navegador.

## Arquitectura relevante

- `backend/src/controllers/erpConsolidation.controller.js`: operaciones consolidadas del ERP/POS.
- `backend/src/controllers/beta2.controller.js`: recursos normalizados, caja, borradores e impresión.
- `backend/src/afip/`: WSAA, WSFE y resolución fiscal A/B/C.
- `backend/src/pdf/`: generación y plantillas de comprobantes.
- `backend/database/migrations/`: evolución incremental de SQLite.
- `frontend/src/App.tsx`: interfaz actual por módulos.
- `frontend/src/services/api.ts`: cliente único de API.

## Seguridad

Los certificados y llaves ARCA se almacenan en `backend/storage/private/fiscal`. Nunca deben incluirse en ZIP públicos, Git o carpetas servidas por Express.
