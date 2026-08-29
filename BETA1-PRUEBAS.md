# Pruebas V4.0 Beta 1

## Instalación limpia

```powershell
cd backend
copy .env.example .env
npm install
npm run db:reset-demo
npm run db:check
npm run dev
```

En otra terminal:

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

## Recorrido crítico

1. Iniciar sesión.
2. Entrar al Punto de Venta.
3. Seleccionar cliente, sucursal y cajero.
4. Cargar dos productos.
5. Presionar F10.
6. Ingresar medios de pago y confirmar.
7. Elegir Sí para factura pendiente de ARCA o No para Nota X.
8. Verificar el mensaje con punto de venta y número.
9. Abrir Cierres de caja y desplegar la sesión.
10. Verificar medios de pago, movimiento y total.
11. Entrar en Movimientos de stock y comprobar `SALIDA_VENTA`.
12. Reiniciar backend y frontend: la operación debe continuar registrada.

## Datos que pueden permanecer en localStorage

- Token de sesión.
- Preferencias visuales.
- Borradores de Venta 1–4.

Las ventas confirmadas, pagos, caja, cheques y stock deben quedar en SQLite.
