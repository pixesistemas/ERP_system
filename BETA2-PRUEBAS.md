# Pruebas V4.0 Beta 2.2

## Retiro de reserva por monto

1. Crear una reserva por monto para un cliente.
2. Cambiar posteriormente el precio actual de un producto.
3. En el POS, seleccionar el cliente y su reserva vigente.
4. Cargar el producto y comprobar que aparezca el precio de la fecha reservada.
5. Finalizar: no debe abrirse el modal de cobro; debe generarse un remito.
6. Verificar que baje el saldo reservado y el stock de la sucursal.
7. Verificar que caja y cuenta corriente no tengan movimientos por el retiro.
8. Imprimir el remito: no debe mostrar precios ni total; solo valor declarado discreto.

## Punto de venta

1. Configurar el punto de venta `0001` en formato A4 y luego en 80 mm.
2. Registrar una venta CONTADO y verificar que aparezca el modal de cobro.
3. Registrar una Factura o Nota X en CUENTA CORRIENTE y verificar el débito completo del cliente, sin movimiento de caja.
4. Registrar una Nota de pedido en CUENTA CORRIENTE y verificar que no genere deuda hasta su documento final.
5. Cargar artículos en Venta 1 y Venta 2, cerrar sesión e ingresar nuevamente: ambos borradores deben recuperarse.
6. Verificar la impresión según el formato del punto de venta.
7. Probar el botón de pantalla completa.

## Automáticas verificadas

```powershell
cd backend
npm run db:reset-demo
npm run db:check
npm run audit:normalized
npm run test:beta2
```

La prueba usa una base aislada y comprueba apertura de caja, depósito, conciliación, orden de pago con dos cheques, egreso, arqueo y cierre.

## Recorrido manual

1. Crear un banco y dos cheques.
2. Depositar uno y conciliarlo.
3. Abrir una caja para un cajero.
4. Emitir una orden de pago usando el segundo cheque y efectivo.
5. Revisar el detalle y cerrar informando el efectivo contado.
6. Confirmar que los estados persisten al volver a iniciar sesión.
