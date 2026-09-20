# Manual del sistema de pedidos móviles, reparto y reportes

Guía completa para vendedores, administradores y repartidores.

---

## 1. ¿Qué hace este sistema?

Permite que los **vendedores** tomen pedidos desde el celular (incluso sin señal), que el **administrador** los revise y confirme, que se armen **rutas de reparto** y que el **repartidor** entregue con hora y ubicación. Todo queda registrado con trazabilidad y se puede consultar en **reportes** por vendedor, cliente y producto.

Flujo general:

```
VENDEDOR toma el pedido  ->  ADMINISTRADOR revisa y confirma  ->  se arma la RUTA
      ->  REPARTIDOR entrega  ->  REPORTES
```

---

## 2. Activación (lo hace PixeSistemas una sola vez)

1. Entrar al panel de Superadmin (`#/superadmin`) con el usuario `superadmin`.
2. Ir a la solapa **Módulos** y tildar **"Pedidos móviles + reparto"** en la empresa que va a usarlo. Sin este tilde, la empresa no ve el módulo.
3. En **Usuarios**, crear los usuarios que van a usar el sistema y asignarles el rol:
   - **ADMIN** (oficina, confirma pedidos y arma rutas).
   - **VENDEDOR** (toma pedidos en la calle).
   - **REPARTIDOR** (entrega).
4. En **Roles y permisos**, marcar las pantallas que verá cada rol (App vendedor, Bandeja de pedidos, Reparto, App repartidor, Reportes de vendedores, Cartera de clientes).
5. Opcional: tildar **"POS simplificado"** para que en el Punto de venta solo queden **facturar y nota de venta**: se ocultan los checkboxes de Presupuesto, Reserva, Nota de pedido, Remitos y Notas de crédito/débito.

**Direcciones de las apps:**
- Vendedores: `https://vendedor.pixesistemas.com.ar`
- Repartidores: `https://repartidor.pixesistemas.com.ar`

Al abrir esas direcciones, el sistema entra directo a la pantalla móvil correspondiente.

**Qué se imprime en los comprobantes:** en Superadmin → **Comprobantes** podés elegir, por empresa y por comprobante (factura, nota de venta, presupuesto, nota de pedido, remito, notas de crédito/débito), qué datos salen en el PDF A4 y en el ticket de 80 mm: Logo, Dirección, Teléfono, WhatsApp, Mail, Vendedor, Observaciones, Pie y QR/CAE fiscal.

---

## 3. Configuración inicial (administrador de la empresa)

### 3.1 Vincular el usuario con el vendedor
Menú **Gestión → Vendedores y comisiones**:
1. Editar (lápiz) el vendedor (o crear uno nuevo).
2. En **Usuario del sistema**, elegir el usuario con el que ese vendedor inicia sesión.
3. Guardar. La comisión % de este vendedor se usa en los reportes.

> Si el vendedor no está vinculado, la App vendedor avisa: "Tu usuario no está vinculado a un vendedor".

### 3.2 Marcar clientes para pedidos
Menú **Gestión → Clientes**:
1. Editar el cliente.
2. Completar **Localidad, Provincia, Latitud y Longitud** (opcional pero recomendado: se usa para la ruta y el mapa).
3. Tildar **"Cliente de pedidos"**.
4. Guardar.

### 3.3 Cargar la cartera de cada vendedor
Menú **Gestión → Cartera de clientes**:
1. Elegir el **vendedor**.
2. Buscar clientes por nombre, CUIT o dirección.
3. Tildar los clientes que ese vendedor puede visitar.
4. **Guardar cartera**.

> El vendedor solo ve los clientes de su cartera.

---

## 4. App del vendedor (celular)

### 4.1 Instalar la app
1. Abrir en el navegador del celular (Chrome o Safari): `https://vendedor.pixesistemas.com.ar`.
2. Menú del navegador → **"Agregar a pantalla de inicio"**.
3. Queda como una app: se abre a pantalla completa y funciona sin señal.

### 4.2 Pantalla de inicio
- Saludo del vendedor y cantidad de clientes en su cartera.
- Estado **🟢 Online** o **📴 Sin conexión**.
- Si hay pedidos sin enviar: **"3 pendiente(s)"** (tocar para sincronizar).
- Botones grandes: **Pedidos de hoy · Clientes · Ruta · Visitas**.

### 4.3 Tomar un pedido (paso a paso)
1. Tocar **Clientes** y buscar por nombre, CUIT, teléfono o dirección.
2. Tocar el cliente. Se ve su dirección, teléfono y accesos a **Llamar** y **Mapa**.
3. Tocar **NUEVO PEDIDO**.
4. Buscar el producto por código, descripción o código de barras.
5. Tocar el producto para agregarlo; ajustar cantidad con **− / +**.
6. (Opcional) Escribir una observación.
7. Tocar **ENVIAR PEDIDO**.

Al enviar, el sistema guarda automáticamente: vendedor, cliente, fecha y hora, ubicación GPS, productos, cantidades y dispositivo.

- Si hay Internet: el pedido llega al instante a la oficina.
- Si **no hay señal**: el pedido queda guardado en el celular con el cartel **"📴 Pedido guardado. Se enviará cuando vuelva Internet."** y se sincroniza solo cuando vuelve la conexión. Nunca se pierde ni se duplica.

### 4.4 Registrar una visita (sin pedido)
1. Entrar al cliente → **REGISTRAR VISITA**.
2. Elegir el resultado: **Pedido realizado / No compró / Local cerrado / No estaba / Reprogramar**.
3. (Opcional) Observaciones.
4. **Guardar visita**. Se registran fecha, hora y GPS.

### 4.5 Pedidos y ruta
- **Pedidos de hoy**: lista de pedidos enviados (con estado) y los pendientes de sincronizar.
- **Ruta**: la cartera ordenada por localidad, para recorrer el día.

---

## 5. Bandeja de pedidos (administrador)

Menú **Ventas → Bandeja de pedidos**.

### 5.1 Ver los pedidos
- Filtros: **Estado**, **Vendedor**, **Desde/Hasta** y búsqueda por cliente, vendedor o número.
- Chips de resumen por estado (tocar para filtrar).
- En la tabla: fecha y hora de la visita, vendedor, cliente, **ubicación en el mapa**, total y estado.

### 5.2 Revisar un pedido
1. Tocar **Abrir**.
2. Se ve el detalle: vendedor, cliente, hora y ubicación de la visita, y todos los productos.
3. Antes de confirmar se puede:
   - **Cambiar la cantidad** de un producto (campo "Cantidad final").
   - **Marcar "No disponible"** (el producto queda tachado y se quita del pedido).
4. Escribir una observación de la revisión (ej.: "faltaba stock").
5. Elegir:
   - **Confirmar pedido**: pasa completo a preparación.
   - **Dejar parcial**: se confirma solo lo que quedó (los productos quitados no se preparan).
   - **Rechazar**: el pedido se anula.

### 5.3 Estados y trazabilidad
Los estados posibles son: **PENDIENTE → REVISANDO → CONFIRMADO / PARCIAL / RECHAZADO → PREPARANDO → DESPACHADO → ENTREGADO**.
Cada movimiento queda registrado en **Trazabilidad** (fecha, usuario, estado y detalle), al pie del pedido.

---

## 6. Preparación y reparto (administrador)

Menú **Ventas → Reparto**.

### 6.1 Armar una ruta
1. Solapa **Armar ruta**: aparecen los pedidos confirmados (con vendedor, cliente, dirección y total).
2. Elegir **Repartidor** y **Fecha**.
3. Tildar los pedidos que van en la ruta.
4. Crear:
   - **Crear ruta manual**: en el orden que elijas (después se puede reordenar).
   - **Crear ruta ordenada por zona**: agrupa por localidad y ordena por cercanía GPS automáticamente.
5. Al crear la ruta, los pedidos pasan a **PREPARANDO**.

### 6.2 Rutas armadas
1. Solapa **Rutas armadas**: listado con repartidor, cantidad de paradas, total y estado.
2. **Abrir** una ruta para ver el recorrido en orden:
   - Reordenar paradas con las flechas ↑↓ y **Guardar orden**.
   - Ver la **Carga del vehículo**: suma automática de todos los productos de la ruta.
   - **Imprimir hoja**: A4 con el recorrido y la carga para llevar en el camión.
   - **Cerrar ruta**: el repartidor deja de verla.

---

## 7. App del repartidor (celular)

Abrir `https://repartidor.pixesistemas.com.ar` en el celular (o Menú **Ventas → App repartidor** en la computadora) e instalarla con "Agregar a pantalla de inicio".

1. Al entrar, muestra la **ruta del día** asignada a su usuario.
2. Cada parada muestra: número de orden, cliente, dirección, teléfono, pedido y estado.
3. Botones por parada:
   - **Navegar**: abre Google Maps con la dirección.
   - **Llamar**: llama al cliente.
   - **Productos**: detalle de lo que lleva.
4. **Ver carga del vehículo**: total de mercadería de toda la ruta (lista de carga).
5. **REGISTRAR ENTREGA**:
   - **Entregado / Entrega parcial / No entregado**.
   - Observación opcional.
   - Se guarda fecha, hora y ubicación GPS.
6. Una entrega ya marcada se puede corregir con **"Cambiar entrega"**.

---

## 8. Reportes de vendedores

Menú **Ventas → Reportes de vendedores**.

### 8.1 Filtros
- **Desde / Hasta**: por defecto ambos son **el día de hoy**. Se pueden cambiar por cualquier período.
- **Vendedor**: todos o uno en particular.
- **Búsqueda rápida**: filtra por cliente, producto o código dentro del reporte.
- **Aplicar** para actualizar.

### 8.2 Vistas fijas (solapas)
- **Por vendedor**: vendedor, cantidad, precio y comisión.
- **Vendedor y cliente**: clientes de cada vendedor con subtotal por vendedor.
- **Vendedor y producto**: productos por vendedor con subtotal.
- **Por cliente**: cantidad, precio y comisión por cliente.
- **Cliente y producto**: productos por cliente con subtotal.
- **Por producto**: ranking de productos por cantidad y precio.
- **Detalle**: árbol Vendedor → Cliente → Productos, expandible (botón **Expandir todo**).

Al pie siempre aparece el **Total Acumulado**.

### 8.3 Exportar
- **PDF / imprimir**: abre el reporte listo para imprimir (A4, letra chica, encabezado repetido). Desde el diálogo se puede "Guardar como PDF".
- **Excel**: descarga un archivo `.xls` que abre en Excel.
- **CSV**: descarga `.csv` (separador `;`) para importar en cualquier sistema.

---

## 9. Preguntas frecuentes

**No veo el módulo en el menú.**
Verificar que el Superadmin haya tildado "Pedidos móviles + reparto" para la empresa y volver a iniciar sesión.

**El vendedor no ve clientes.**
Cargar la cartera en **Cartera de clientes** y verificar que el cliente tenga tildado "Cliente de pedidos".

**El vendedor no puede enviar el pedido: "Ese cliente no está en tu cartera".**
Agregar ese cliente a la cartera del vendedor.

**No aparece el pedido en la bandeja.**
Revisar el filtro de estado (los nuevos entran como **PENDIENTE**) y el rango de fechas.

**El repartidor no ve la ruta.**
La ruta tiene que estar asignada a **su usuario** y no estar cerrada.

**El vendedor trabajó sin señal, ¿se perdió el pedido?**
No. En la App vendedor queda como "pendiente de sincronizar" y se envía solo al recuperar Internet.

**¿Dónde veo quién cambió un pedido?**
En la **Trazabilidad** dentro del detalle del pedido (fecha, usuario, estado y detalle).

---

## 10. Resumen del proceso

| Paso | Quién | Dónde |
|---|---|---|
| Activar módulo | PixeSistemas | Superadmin → Módulos |
| Crear usuarios y roles | Admin | Usuarios / Roles |
| Vincular vendedor | Admin | Vendedores y comisiones |
| Marcar cliente de pedidos | Admin | Clientes |
| Cargar cartera | Admin | Cartera de clientes |
| Tomar pedido / visita | Vendedor | App vendedor (celular) |
| Revisar y confirmar | Admin | Bandeja de pedidos |
| Armar ruta | Admin | Reparto |
| Entregar | Repartidor | App repartidor (celular) |
| Medir y exportar | Admin | Reportes de vendedores |

Ante cualquier duda, contactar a PixeSistemas.
