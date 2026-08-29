# Pruebas rápidas

1. Ejecutar `npm run db:reset-demo` en backend.
2. Crear una compra con IVA 21% desde Compras.
3. Abrir Libro IVA, elegir el mismo mes/año y revisar IVA Compras y crédito fiscal.
4. Crear una reserva por monto para un cliente.
5. Ir al POS, seleccionar ese cliente y elegir la reserva en `RESERVA POR MONTO`.
6. Cargar productos: el precio debe salir del snapshot guardado al crear la reserva.
7. Cerrar la operación: el saldo de la reserva debe disminuir.
8. En Diseñador de comprobantes revisar las vistas reales de Factura, Presupuesto y Remito.
