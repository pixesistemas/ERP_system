# V4.0 Beta 1.3 — eliminación de almacenamiento local persistente

- Eliminadas todas las referencias a `localStorage` del frontend y backend.
- Token y borradores temporales de Venta 1–4 quedan limitados a `sessionStorage`; desaparecen al cerrar la pestaña o cerrar sesión.
- Catálogos y configuraciones que aún no tienen tabla normalizada se guardan en SQLite mediante `app_state` y `/api/v1/erp/state/:key`.
- Proveedores, cheques, caja heredada, catálogos, vendedores, sucursales, cajeros, monedas, promociones, combos, diseñador, empresa y reportes dejan de persistir en el navegador.
- Agregada migración `031-add-app-state.js`.
- Agregada auditoría `npm run audit:no-local-storage`.

## Nota
`app_state` es una etapa de consolidación: ya centraliza los datos en SQLite y permite usarlos desde varias computadoras. Los módulos críticos seguirán migrándose de JSON genérico a tablas relacionales específicas.
