# V4.0 Beta 1.2

## Compras y gastos

- Percepciones suman al total a pagar.
- Retenciones restan del total a pagar.
- El backend guarda el importe neto de percepciones/retenciones y usa el total final para el egreso de caja.
- Se agregó un desglose visible: comprobante con IVA, percepciones, retenciones y total a pagar.
- Campos monetarios aceptan enteros y decimales con `step="any"`.

## Altas rápidas junto a selectores

Se agregó un botón `+` junto a:

- Proveedor.
- Moneda.
- Condición de pago.
- Rubro de gasto.
- Tipo de percepción/retención.

La opción creada queda seleccionada inmediatamente en la compra actual.

## Nota de consolidación

Las altas rápidas conservan compatibilidad con los catálogos de la Beta 1.1. En la siguiente etapa de consolidación estos catálogos deben migrarse de `localStorage` a tablas/API SQLite, junto con proveedores y monedas.
