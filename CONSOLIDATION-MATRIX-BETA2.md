# Matriz de consolidación Beta 2

| Módulo | Tabla | API | UI | Prueba |
|---|---:|---:|---:|---:|
| Proveedores/monedas/catálogos de compra | Sí | Sí | Sí | Auditoría |
| Vendedores/comisiones | Sí | Sí | Sí | Auditoría |
| Sucursales/cajeros/puntos de venta | Sí | Sí | Sí | Financiera |
| Promociones/descuentos/combos | Sí | Sí | Sí | Auditoría |
| Empresa/diseñador | Sí | Sí | Sí | Build |
| Bancos/cheques/depósitos | Sí | Sí | Sí | Financiera |
| Conciliación/órdenes de pago | Sí | Sí | Sí | Financiera |
| Caja por cajero | Sí | Sí | Sí | Financiera |
| Cuenta corriente desde POS | Sí | Sí | Sí | Beta 2.1 |
| Borradores Venta 1–4 | Sí | Sí | Sí | Beta 2.1 |
| Impresión A4/80 mm por punto de venta | Sí | Sí | Sí | Beta 2.1 |
| Reserva por monto → remito → stock | Sí | Sí | Sí | Beta 2.2 |

## Almacenamiento

- `localStorage`: cero usos.
- `sessionStorage`: únicamente credenciales de la sesión activa.
- Borradores Venta 1–4: tabla `pos_borradores`, separados por empresa y usuario.
- `app_state`: queda solo para módulos heredados fuera del alcance Beta 2. Las claves normalizadas se atienden mediante tablas propias y `/api/v1/erp/resources/:key`.
- La auditoría falla si una clave normalizada vuelve a persistirse en `app_state`.
