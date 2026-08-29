# V3.1.1 — Reparación de base de datos

Esta versión conserva todos los módulos visuales y funcionales de la V3.1 y corrige la inicialización incompleta de SQLite.

## Cambios

- Ejecución automática de todas las migraciones al iniciar el backend.
- Creación automática de usuarios, roles y permisos.
- Usuario demo `admin@empresa.com` con clave `admin123`.
- Datos de demostración de empresa, clientes, productos, depósito y vendedor.
- Copia de seguridad automática de la base antes de migrar.
- Comandos `db:migrate`, `db:seed`, `db:check` y `db:reset-demo`.
- La V3.1 ya no depende de copiar una base de versiones anteriores.
