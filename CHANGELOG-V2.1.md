# AFIP Conversacional Demo V2.1

## Corrección

- Se corrigió el flujo posterior a omitir un producto no encontrado.
- Al responder **Confirmar** desde el estado de carga de productos, si ya existen artículos válidos, el motor ahora avanza al resumen final en lugar de volver a preguntar qué producto agregar.
- La corrección se aplica al motor compartido por la web, API, n8n y WhatsApp.

## Caso corregido

1. Se agrega cemento y un hierro inexistente.
2. Se responde `omitilo`.
3. Se responde `confirmar`.
4. El asistente muestra el resumen de los productos válidos.
5. Una segunda confirmación genera el documento.
