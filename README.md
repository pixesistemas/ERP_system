# AFIP Conversacional Demo V4.0 Beta 2.2

Demo integrada de asistente comercial, POS y módulos ERP.

## Inicio rápido

Backend:
```powershell
cd backend
copy .env.example .env
npm install
npm run dev
```

Frontend:
```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Abrir `http://localhost:5173`.

## Atajos del POS

- `F2`: código o código de barras
- `F4`: descripción
- `F8`: cliente
- `F10`: cerrar/cobrar venta
- `Ctrl+1` a `Ctrl+4`: cambiar venta abierta
- `*` dentro de un medio de pago: completar faltante

## Seguridad

No subir `.env`, certificados, claves privadas, tokens ni bases reales a GitHub.

Ver `CHANGELOG-V4.0-beta2.2.md`, `PROJECT-CONTEXT.md` y `ROADMAP.md` para el estado actual.


## Versión V3.1
Consultar `CHANGELOG-V3.1.md` para los cambios del POS, reservas, catálogos, empresa y reportes.

## Reparación V3.1.1 — Base de datos automática

Esta entrega conserva todos los módulos de la V3.1. Al ejecutar el backend, el sistema aplica automáticamente todas las migraciones y crea los datos mínimos de la demo.

### Instalación limpia

```powershell
cd backend
copy .env.example .env
npm install
npm run db:reset-demo
npm run db:check
npm run dev
```

Credenciales:

```text
Usuario: admin@empresa.com
Contraseña: admin123
Empresa: empresa1
```

### Actualizar una base existente sin perder datos

Antes de iniciar, copiá tu archivo `backend/data/afip_api.db` dentro de esta versión y ejecutá:

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev
```

El arranque crea una copia de seguridad dentro de `backend/data/backups/` antes de aplicar cambios.


## Corrección V3.1.2

Para crear una base demo desde cero:

```powershell
cd backend
npm install
npm run db:reset-demo
npm run db:check
npm run dev
```

El proceso crea primero todas las tablas, incluida `empresa_configuraciones`, y recién después carga el usuario administrador y los datos demo.

## Versión 3.2

Esta versión agrega bancos, conciliación bancaria, notas de pedido con vendedor y comisión, sucursales, cajeros, reportes operativos, costos/utilidad y detalle desplegable de comprobantes. Los módulos nuevos de demostración guardan su información en el navegador hasta la migración definitiva a Express + MySQL.


## V3.5
Ver `CHANGELOG-V3.5.md` para las mejoras de caja, puntos de venta, promociones, ARCA y reportes dinámicos.


## Versión 3.6
Consultá `CHANGELOG-V3.6.md` para los cambios de reportes, buscadores, catálogo y diseñador de comprobantes.
