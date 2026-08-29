# V4.0 Beta 2.1

- Condición de venta del POS limitada a `CONTADO` y `CUENTA CORRIENTE`.
- Contado abre el modal de efectivo, tarjeta, QR, transferencia y cheques.
- Facturas y Nota de Venta X en cuenta corriente generan el débito completo del cliente, sin movimiento de caja ni medios de cobro.
- Notas de pedido admiten condición de cuenta corriente, sin generar deuda hasta convertirse en un documento final.
- Formato de impresión A4 o ticket 80 mm configurable por punto de venta.
- Vista imprimible automática para facturas y Nota de Venta X.
- Mensajes visuales durante registro, actualización e impresión.
- Venta 1–4 persistidas en `pos_borradores`, por empresa y usuario.
- Botón de pantalla completa en el POS.
- Migración `033-pos-account-drafts-print.js`.

