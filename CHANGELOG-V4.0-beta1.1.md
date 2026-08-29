# V4.0 Beta 1.1

## Corrección de migración

- La migración `030-add-pos-core.js` ahora crea `caja_movimientos` antes de agregarle las columnas del núcleo POS.
- Corrige el error `SqliteError: no such table: caja_movimientos` durante `npm run db:reset-demo`.
- Conserva todos los módulos y cambios incluidos en V4.0 Beta 1.
