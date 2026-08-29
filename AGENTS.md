# Reglas de trabajo del proyecto

Este repositorio contiene el ERP AFIP Conversacional. Antes de modificar código, leer `PROJECT-CONTEXT.md`, `ROADMAP.md` y el changelog de la versión actual.

## Reglas obligatorias

- No eliminar módulos existentes para resolver una corrección.
- No usar `localStorage` para ningún dato. `sessionStorage` se limita a las credenciales de la sesión activa.
- Los datos comerciales confirmados deben persistirse en SQLite mediante API. Los borradores del POS se guardan en `pos_borradores`.
- Cada cambio de estructura debe incluir una migración incremental, compatible con bases existentes.
- No guardar certificados, llaves privadas, archivos `.env`, bases de datos ni tokens en Git.
- Reutilizar servicios centrales para web, asistente y WhatsApp; no duplicar reglas comerciales por canal.
- No marcar una función como terminada si solo tiene una pantalla sin circuito de backend.

## Verificación mínima

Desde `backend`:

```powershell
npm run db:check
npm run audit:normalized
npm run test:beta2
```

Desde `frontend`:

```powershell
npm run audit:no-local-storage
npm run build
```

Para cambios financieros o de stock, agregar una prueba de punta a punta que compruebe la transacción y sus efectos relacionados.
