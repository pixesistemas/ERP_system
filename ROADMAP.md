# Hoja de ruta

## Completado y probado

- Catálogos normalizados principales.
- Caja por sucursal y cajero.
- Venta contado y cuenta corriente.
- Cheques, depósitos, conciliación y órdenes de pago múltiples.
- Compras y Libro IVA básico.
- Borradores persistentes Venta 1–4.
- Impresión A4/80 mm por punto de venta.
- Auditoría automática sin `localStorage`.

## En curso: V4.0 Beta 2.2

- Retiro de reserva por monto exclusivamente mediante remito.
- Precios congelados de la reserva.
- Descuento transaccional de stock y saldo reservado.
- Numeración de remito por punto de venta.
- PDF/impresión de remito sin precios, con valor declarado discreto.

## Próxima etapa fiscal

- Conectar el cierre `Sí` del POS con WSAA/WSFE.
- Resolver automáticamente Factura A, B o C.
- Registrar estado fiscal, CAE, vencimiento, errores y reintentos.
- Generar factura, NC y ND con las plantillas oficiales.
- Mantener un flujo seguro cuando ARCA no responde.
- Pruebas reales de homologación ARCA con certificado propio.

## Antes de producción

- Migrar SQLite a MySQL con migraciones reproducibles.
- Pruebas integrales multiempresa y multisucursal.
- Permisos por rol y auditoría de operaciones sensibles.
- Backups automáticos y despliegue de staging.
- Pruebas reales de homologación ARCA.
