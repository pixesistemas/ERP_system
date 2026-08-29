# Auditoría de almacenamiento

## Prohibido
No se utiliza `localStorage` en ningún archivo fuente.

## Permitido temporalmente
- `sessionStorage`: token de sesión y borradores temporales de Venta 1–4.
- SQLite/API: todos los datos persistentes y comerciales.

## Verificación
```bash
npm run audit:no-local-storage
```
El comando falla si vuelve a introducirse una referencia a `localStorage`.
