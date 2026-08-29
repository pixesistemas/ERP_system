# Roles y permisos, y velocidad del punto de venta

## Roles y permisos por pantalla
El backend ya tenía un esquema de usuarios/roles/permisos bien armado
(`usuarios`, `roles`, `permisos`, `usuario_roles`, `rol_permisos`) pero:
- Solo existía un rol (`ADMIN`) con todos los permisos — no había forma de
  crear un rol más limitado.
- Los permisos que sí se validaban en el backend (24 en total, ej.
  `stock.gestionar`, `documentos.crear`) son a nivel de **acción de API**, no
  de pantalla — la mayoría de las pantallas del ERP (POS, bancos, cheques,
  caja, puntos de venta, etc.) no tenían ningún permiso asociado.
- El frontend no leía permisos ni roles para nada: cualquier usuario logueado
  veía el menú completo.

**Qué se agregó**, sin tocar el sistema de permisos de API existente (para no
romper nada de lo que ya funcionaba):
- Tabla nueva `rol_pantallas` (migración `036`): qué pantallas del menú puede
  ver cada rol. Si un rol no tiene ninguna marcada, ve todas — así el rol
  ADMIN sigue funcionando exactamente igual que antes sin migrar datos.
- Endpoints `/api/v1/roles` (crear, listar, eliminar, guardar pantallas) y
  se extendió `/auth/login` y `/auth/me` para que devuelvan qué pantallas
  puede ver el usuario logueado.
- Pantalla **Roles y permisos**: crear roles y tildar qué pantallas puede ver
  cada uno, agrupadas igual que el menú.
- Pantalla **Usuarios**: alta de usuarios, activar/desactivar, cambiar de rol
  (usa endpoints que ya existían en el backend pero no tenían pantalla).
- El menú lateral y el enrutamiento ahora filtran por las pantallas del rol
  del usuario logueado; si de algún modo cae en una pantalla que no le
  corresponde, se lo redirige al Resumen.

**Lo que NO hice:** no toqué los 24 permisos de API existentes ni intenté
mapear pantalla-por-pantalla contra ellos — son dos sistemas distintos
(acción de API vs. visibilidad de pantalla) y unificarlos es un cambio más
grande y más riesgoso de hacer sin poder probarlo en vivo. Con lo que se
agregó ya se puede armar, por ejemplo, un rol "Cajero" que solo vea Punto de
venta, Caja e Historial de ventas.

## Punto de venta: dos correcciones de fondo
1. Había un `useEffect` que, en cada cambio del carrito (o sea, en **cada
   tecleo** mientras se vende), buscaba a mano en el DOM el `<select>` de
   "Condición de pago" para arreglarle las opciones — porque las opciones
   fijas del JSX tenían un valor mal cargado (`CTA_CTE` en vez de
   `CUENTA_CORRIENTE`, que es lo que espera el backend). Esto costaba
   rendimiento en cada tecleo y, si por algún motivo el efecto no llegaba a
   correr, una venta podía quedar mal marcada como "cuenta corriente" o
   "contado" sin que nadie lo notara. Se sacó el parche y se corrigió el
   `<select>` directamente.
2. Al buscar productos o clientes por descripción, cada tecleo sin
   coincidencia local disparaba un pedido al servidor sin ningún control de
   orden de llegada — tipeando rápido, una respuesta vieja podía llegar
   después que una más nueva y pisarla, mostrando sugerencias que ya no
   correspondían a lo que se estaba escribiendo. Se agregó un control simple
   de secuencia que descarta las respuestas que quedaron desactualizadas.

## Verificado
Sintaxis real de TypeScript + resolución de módulos (mismo pipeline de todas
las rondas anteriores) — 0 errores. Sintaxis real de Node en los archivos
backend con `node --check`. No pude probar el login/roles contra un servidor
real (sin red en este entorno) — antes de darlo por bueno, prueben crear un
rol con pocas pantallas marcadas, asignárselo a un usuario de prueba, y
verificar que el menú se recorta como corresponde.
