# AFIP Conversacional Demo V3.1

## Punto de venta
- El cobro aparece antes de elegir el tipo de comprobante.
- Luego del cobro se pregunta **¿Registrar venta?** con botones **Sí** y **No**.
- Sí registra Factura Electrónica; No registra Nota de Venta X.
- Presupuesto y Reserva se seleccionan desde el encabezado y no solicitan medios de pago.
- Las reservas exigen un cliente real del sistema.
- Presupuestos, reservas y notas X se guardan en listados buscables.
- Se mantienen cuatro ventas independientes con cliente, artículos y modo propio.

## Cuenta corriente y recibos
- Inputs de cobro con comportamiento tipo calculadora.
- Tecla * completa el saldo faltante.
- Acceso para reimprimir recibos desde movimientos cuando existe recibo asociado.

## Empresa
- Pantalla de datos completos de empresa y logo.
- El logo deja de pertenecer a Configuración general.

## Nuevos módulos visuales
- Rubros, subrubros y marcas.
- Actualización masiva de precios.
- Importación/actualización de productos desde Excel o CSV.
- Precios de góndola con selección e impresión.
- Vendedores y comisiones.
- Centro de reportes.
- Cobros con tarjetas asociados a comprobantes (estructura inicial).

## Conversación
- Se amplía la normalización para expresiones como “agregame”, “agrégame” y “quiero agregar”.
- Al existir un producto pendiente no encontrado, una nueva orden de producto puede reemplazarlo sin repetir el error anterior.
