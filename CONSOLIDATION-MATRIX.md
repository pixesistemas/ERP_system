# V4.0 — Matriz de consolidación

Esta versión inicia el reemplazo de datos comerciales en `localStorage` por SQLite + API.

| Circuito | Tabla SQLite | API real | Frontend conectado | Estado |
|---|---:|---:|---:|---|
| Bancos | Sí | Sí | API disponible | En migración visual |
| Puntos de venta | Sí | Sí | API disponible | En migración visual |
| Cheques en cartera | Sí | Sí | API disponible | En migración visual |
| Depósito de cheques | Sí, transaccional | Sí | API disponible | En migración visual |
| WhatsApp autorizados | Sí | Sí | API disponible | En migración visual |
| Certificado/llave ARCA | Sí, fuera de public | Sí, multipart | API disponible | En migración visual |
| Productos | Sí | Sí | Sí | Revisión de relaciones pendiente |
| Transferencias de stock | Parcial | Parcial | Local | Pendiente |
| Reserva por monto | No consolidada | No | Local | Pendiente |
| PDFs oficiales | Plantillas incluidas | Parcial | Parcial | Pendiente selector tipo/letra |

## Pruebas manuales obligatorias

1. Crear banco y recuperarlo desde `GET /api/v1/erp/bancos`.
2. Crear cheque `EN_CARTERA` y recuperarlo desde `GET /api/v1/erp/cheques?states=EN_CARTERA`.
3. Depositar uno o varios cheques y verificar estado `DEPOSITADO`.
4. Crear punto de venta y verificar unicidad por empresa.
5. Cargar teléfono autorizado y validar permisos persistidos.
6. Subir `.crt` y `.key`; verificar que no estén bajo `/public` ni expuestos por `/storage`.
