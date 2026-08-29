# V2.6 — IA opcional, stock y cuenta corriente

## Conversación
- Capa opcional de IA compatible con APIs de chat completions.
- La IA normaliza lenguaje natural y mejora la redacción, pero no escribe en la base ni ejecuta acciones por sí sola.
- El parser local queda como respaldo automático.
- Los errores de stock muestran producto, solicitado y disponible, evitando `[object Object]`.
- La misma ruta conversacional continúa disponible para web y WhatsApp/n8n.

## Inventario
- Selector de producto con búsqueda por código, código de barras o descripción.
- Alertas visuales para stock sin existencia o por debajo del mínimo.
- Estado NORMAL/REPOSICIÓN en el listado.
- Política configurable por empresa: bloquear, advertir o ignorar el control de stock.

## Cuenta corriente
- Nuevo listado visual de clientes.
- Detalle con saldo, historial de débitos/créditos y registro de cobros.
- Cobros combinados: efectivo, tarjeta, QR, transferencia y cheque.

## Comprobantes
- El listado usa `importe_total` como fuente principal y evita mostrar cero cuando el documento posee total calculado.

## Configuración
- Nueva pantalla para guardar la política de stock y las alertas por empresa.
