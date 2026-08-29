# El ticket no se parecía en nada a los demás comprobantes

Tenías razón: comparé la captura del remito real contra los PDF que
mandaste (factura A, factura B, presupuesto, remito) y mi plantilla de
ticket quedó con un diseño propio — texto centrado, sin bordes — mientras
que el resto del sistema usa un estilo consistente con cajas y bordes bien
definidos (encabezado partido en 2 con la empresa a la izquierda y el
comprobante a la derecha, tabla de ítems con bordes, pie con firma/QR a la
izquierda y totales a la derecha).

## Qué se cambió
Reescribí la plantilla del ticket (`documents/templates/ticket/ticket.html`)
para que use el mismo lenguaje visual que ya usan los presupuestos y
remitos "de verdad" (`commercial/documento.html`): mismas proporciones de
caja, mismo estilo de tabla, mismo esquema de pie de página. Es la misma
estructura que ya tenían aprobada — no inventé un diseño nuevo.

- **Formato A4**: encabezado partido en 2 columnas con borde, igual que el
  resto de los comprobantes.
- **Formato ticket 80mm**: la misma plantilla, pero en una sola columna
  angosta (un ticket térmico no puede mostrar dos columnas lado a lado).
- El QR + CAE + vencimiento se ubica abajo a la izquierda cuando el
  comprobante es una factura autorizada — igual que en las facturas A/B
  que mandaste.
- El remito de retiro de reserva quedó con el mismo formato que tu PDF de
  referencia: valor declarado a la derecha, leyenda de "documento no
  fiscal" y las dos líneas de firma abajo.

## Cómo lo verifiqué
Generé 3 comprobantes de prueba con datos ficticios (una factura A4 con
CAE, un remito A4, y un ticket de 80mm) usando el motor real, sin tocar la
base de datos, y revisé el HTML resultante línea por línea: los bloques de
la factura (QR + CAE a la izquierda, total a la derecha) y del remito
(valor declarado, leyenda, firmas) coinciden con la estructura de tus PDF
de referencia. También crucé cada `{{PLACEHOLDER}}` de la plantilla contra
las claves que arma el motor — coinciden exactamente, ninguno quedó
huérfano — y confirmé que las etiquetas HTML (div, table, tr, etc.) están
balanceadas.

Lo que no pude hacer en este entorno es abrirlo en un navegador real y
verlo impreso — probalo con una venta de prueba y fijate si el resultado
ahora sí se parece a lo que mandaste.
