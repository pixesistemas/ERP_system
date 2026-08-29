# Commercial Parser

Este módulo transforma mensajes escritos en lenguaje natural en objetos `CommercialCommand`.

## Responsabilidad

El módulo puede interpretar:

- operación comercial;
- cliente;
- productos;
- cantidades;
- condición y medio de pago;
- descuento;
- documento de origen;
- fecha de entrega.

## Restricciones

El parser nunca:

- consulta la base de datos;
- resuelve IDs de clientes;
- resuelve IDs de productos;
- consulta stock;
- calcula precios;
- crea documentos;
- factura;
- genera PDFs.

Todas esas tareas corresponden a otros motores del ERP.

## Ejemplo

```javascript
const CommercialParser = require("./src/core/commercial-parser");

const command = CommercialParser.Parser.parse({
  message:
    "Haceme un presupuesto para José con 20 bolsas de cemento y 10 hierros del 8 contado",
  channel: "WHATSAPP",
});

console.dir(command.toPlainObject(), {
  depth: null,
});

console.dir(command.validation, {
  depth: null,
});
```
