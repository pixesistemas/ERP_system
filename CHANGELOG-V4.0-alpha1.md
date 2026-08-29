# V4.0 alpha 1

- Nueva migración 028 con bancos, puntos de venta, cheques, depósitos y archivos fiscales.
- API SQLite real bajo `/api/v1/erp`.
- Depósito de múltiples cheques mediante una transacción.
- CRUD de WhatsApp autorizados con permisos consultar/presupuestar/facturar.
- Subida multipart segura de certificado y llave privada fuera del directorio público.
- Métodos de frontend preparados en `erpApi` para reemplazar gradualmente `localStorage`.
- Matriz explícita de consolidación y pruebas.

Esta alpha no marca como terminados los módulos visuales que todavía usan `localStorage`.
