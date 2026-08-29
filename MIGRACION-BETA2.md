# Migrar V4.0 Beta 1.3 a Beta 2

## Conservar datos existentes

1. Detener backend y frontend.
2. Respaldar `backend/data/afip_api.db`.
3. Copiar esa base dentro de `backend/data/` de Beta 2.
4. Copiar solo las variables necesarias del `.env`.
5. Ejecutar:

```powershell
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run db:check
npm run audit:normalized
npm run dev
```

La migración importa catálogos conocidos de `app_state` solo cuando la tabla normalizada correspondiente está vacía.

## Demo limpia

```powershell
cd backend
copy .env.example .env
npm install
npm run db:reset-demo
npm run db:check
npm run audit:normalized
npm run test:beta2
npm run dev
```

En otra terminal:

```powershell
cd frontend
copy .env.example .env
npm install
npm run build
npm run audit:no-local-storage
npm run dev
```

No ejecutar `db:reset-demo` sobre datos reales.

