# Recepción de mercadería

## Qué resuelve

La pantalla **Gestión → Recibir productos** permite cargar una factura, remito o lista de precios de un proveedor, revisar los renglones y confirmar el ingreso.

Al confirmar, en una única transacción, el sistema puede:

- Generar la compra en el Libro IVA.
- Ingresar stock al depósito elegido.
- Actualizar el costo de cada producto.
- Actualizar el precio de venta con un margen.
- Guardar el código de proveedor para reconocerlo en la próxima recepción.
- Registrar la recepción, sus renglones y los eventos de auditoría.

El borrador no mueve stock, no crea compras y no modifica costos ni precios.

## Acceso y permisos

La pantalla usa la clave `reception` de Roles y permisos. Al guardar un rol con esa pantalla se habilitan estos permisos:

| Permiso | Uso |
| --- | --- |
| `recepcion.importar` | Subir y leer imágenes/PDF con OCR. |
| `recepcion.gestionar` | Crear, ver y editar borradores, depósitos y proveedores. |
| `recepcion.confirmar` | Confirmar la recepción y mover stock. |
| `recepcion.anular` | Anular un borrador. |
| `compras.gestionar` | Generar la factura de compra. |
| `productos.costos` | Actualizar el costo del producto. |
| `productos.precios` | Actualizar el precio de venta. |

El rol **ADMIN** recibe la pantalla y los permisos automáticamente. La pantalla no se agrega sola a los demás roles: hay que habilitarla desde **Roles y permisos** para que un rol no administrador pueda operar.

## Flujo recomendado

1. Elegir el depósito de ingreso.
2. Subir la foto o PDF del comprobante y presionar **Leer con OCR**, o buscar los productos a mano.
3. Revisar cantidades, costos, IVA y total del documento.
4. Asignar los productos que el sistema no pudo reconocer.
5. Crear los productos que falten desde el mismo diálogo de asignación.
6. Elegir si se genera compra, si se actualiza costo y si se actualiza precio.
7. Confirmar. El resultado muestra movimientos de stock y productos actualizados.

## OCR

### Configuración

El OCR usa las mismas variables que el OCR de Compras:

```env
OCR_API_KEY=...
OCR_BASE_URL=https://api.openai.com/v1
OCR_MODEL=gpt-4o-mini
```

También acepta `OPENAI_API_KEY` si no está definida `OCR_API_KEY`.

En Docker/Portainer, cargar `OCR_API_KEY` en las variables del stack. El `docker-compose.yml` ya expone `OCR_API_KEY`, `OCR_BASE_URL` y `OCR_MODEL`.

Sin clave configurada, la carga manual sigue funcionando; el endpoint de OCR responde con un mensaje claro.

### Archivos aceptados

- JPG, JPEG, PNG o WEBP de hasta 10 MB.
- PDF con texto seleccionable de hasta 10 MB.
- Un PDF escaneado (solo imagen) no se puede leer como texto: subir una foto JPG/PNG.

El OCR devuelve cabecera y renglones. No inventa datos: si un campo no se puede leer, lo deja vacío o en cero y marca el renglón para revisión. Siempre hay que revisar antes de confirmar.

### Asociación de productos

El sistema intenta asociar cada renglón en este orden:

1. Código de proveedor guardado para ese proveedor.
2. Código de barras principal.
3. Código de barras adicional (pack).
4. Código interno del producto.
5. Descripción exacta normalizada.

Si no encuentra una coincidencia segura, deja el renglón como **Sin producto** y no permite confirmarlo con cantidad recibida. La asociación manual y la creación rápida se hacen desde el botón **Asignar**.

## Reglas de costos y precios

- `productos.costo` es el costo **neto** (sin IVA).
- `productos.precio` es el precio final **con IVA incluido**.
- Si el comprobante muestra un precio final con IVA, activar **El costo cargado incluye IVA**. El sistema calcula el neto para la compra y para el costo.
- El precio nuevo se calcula como: costo neto × (1 + IVA) × (1 + margen).
- También se puede escribir un precio nuevo manual en la columna **Precio nuevo**.
- Un precio escrito a mano se conserva al cambiar el costo. Si la columna queda vacía, el sistema recalcula el precio con el margen.
- Si no se activa **Actualizar costo**, el costo del producto no cambia.
- Si no se activa **Actualizar precio**, el precio del producto no cambia.
- El margen usado en la recepción se guarda como utilidad del producto cuando se actualiza el precio.
- En una **factura C**, la compra se registra con el total como neto y IVA cero, igual que el resto del ERP. Internamente el costo neto del producto se calcula despejando el IVA del precio final.

## Confirmación transaccional

La confirmación hace todo o nada:

1. Valida depósito, productos, cantidades, diferencias y duplicados.
2. Genera la compra si está marcado **Generar factura de compra**.
3. Inserta el detalle de IVA agrupado por alícuota.
4. Mueve el stock con `RECEPCION_MERCADERIA` como documento de origen.
5. Actualiza costo, precio y utilidad de los productos recibidos.
6. Guarda el código de proveedor en `producto_proveedores`.
7. Marca la recepción como `CONFIRMADA` y registra el evento.

Si una operación falla, se revierte todo y la recepción queda en borrador.

### Validaciones

- No se puede confirmar sin cantidades recibidas.
- Un renglón con cantidad recibida debe tener producto asignado.
- Si hay renglones sin recibir, hay que activar **Permitir recepción parcial**.
- Si el total calculado no coincide con el total del documento, hay que activar **Permitir diferencia de total**.
- Si se genera compra, el comprobante no puede estar registrado ya en `compras`.
- Si no se genera compra, no puede existir otra recepción confirmada con el mismo comprobante.
- Confirmar dos veces la misma recepción es idempotente: no vuelve a mover stock.
- Una recepción confirmada o anulada no se puede editar.

## Estados

| Estado | Significado |
| --- | --- |
| `BORRADOR` | Se puede editar, guardar y anular. No afectó stock ni compras. |
| `CONFIRMADA` | Movió stock, generó compra si correspondía y quedó auditada. |
| `ANULADA` | Borrador descartado. No afectó stock. |

## Modelo de datos

### `recepciones_mercaderia`

Cabecera del documento: proveedor, comprobante, depósito, opciones, totales, archivo OCR, estado, compra vinculada y usuario que confirmó.

### `recepcion_items`

Renglones leídos o cargados a mano: producto, código de proveedor, cantidades facturada/recibida, costo, descuento, IVA, precio actual/nuevo, stock al momento y estado de identificación.

### `recepcion_eventos`

Auditoría de creación, confirmación y anulación.

### Tablas reutilizadas

- `compras`, `compra_iva_detalles`: compra fiscal.
- `stock_productos`, `stock_movimientos`: stock.
- `producto_proveedores`: códigos de proveedor.
- `productos`: costo, precio y utilidad.

## API

Todas las rutas requieren JWT y empresa activa:

| Método | Ruta | Permiso |
| --- | --- | --- |
| GET | `/api/v1/recepcion` | `recepcion.gestionar` |
| GET | `/api/v1/recepcion/:id` | `recepcion.gestionar` |
| GET | `/api/v1/recepcion/depositos` | `recepcion.gestionar` |
| GET | `/api/v1/recepcion/proveedores?q=` | `recepcion.gestionar` |
| POST | `/api/v1/recepcion` | `recepcion.gestionar` |
| PUT | `/api/v1/recepcion/:id` | `recepcion.gestionar` |
| POST | `/api/v1/recepcion/:id/confirmar` | `recepcion.confirmar` |
| POST | `/api/v1/recepcion/:id/anular` | `recepcion.anular` |
| POST | `/api/v1/recepcion/ocr` | `recepcion.importar` |

El OCR se envía como `multipart/form-data` con el campo `file`. Los campos opcionales (`deposito_id`, `uuid`, `crear_factura`, `actualizar_costo`, `actualizar_precio`, entre otros) se envían en el mismo formulario.

## Archivos y almacenamiento

Los archivos originales se guardan en:

```text
backend/storage/recepciones/<empresa_id>/
```

En Docker ese directorio está dentro del volumen persistente `erp_storage`. No se guardan en Git.

## Pruebas

Desde `backend`:

```powershell
npm run test:recepcion
npm run db:check
npm run audit:normalized
npm run test:beta2
```

Desde `frontend`:

```powershell
npm run audit:no-local-storage
npm run build
```

La prueba `test:recepcion` cubre borrador, compra, stock, costos, precios, idempotencia, recepción parcial, permisos, anulación y normalización del OCR.

## Migración y despliegue

- Migración: `102-recepcion-mercaderia.js`.
- Crea las tablas, índices, permisos y la entrada de Novedades.
- Es idempotente y compatible con bases existentes.
- Al reiniciar el backend se aplica automáticamente.
- En una base existente, el backup previo queda en `backend/data/backups/` si se usa `bootstrap`.
- Después de desplegar, reiniciar el stack de Portainer para cargar las rutas y la pantalla.

## Problemas frecuentes

| Síntoma | Causa / solución |
| --- | --- |
| “El OCR no está configurado” | Falta `OCR_API_KEY` en el servidor. Cargar la recepción a mano o configurar la clave. |
| “El PDF no tiene texto seleccionable” | Es un PDF escaneado. Subir una foto JPG/PNG. |
| “No encontré un producto…” | El artículo no existe o el código no coincide. Usar **Asignar → Crear producto**. |
| “Hay renglones sin producto” | Asignar producto a cada renglón con cantidad recibida. |
| “Hay renglones sin recibir” | Recibir todos o activar **Permitir recepción parcial**. |
| “Ese comprobante ya está registrado” | Ya existe una compra o recepción con ese tipo/punto/número. Revisar el número o no generar compra. |
| “El total no coincide” | Corregir cantidades/costos o activar **Permitir diferencia de total**. |
| No aparece la pantalla | Habilitar **Recibir productos** en Roles y permisos. |

## Criterios de seguridad

- No se usa `localStorage`; el token vive en `sessionStorage`.
- Los permisos se validan en el backend, no solo en la pantalla.
- El archivo se valida por tipo y tamaño antes de procesarlo.
- La confirmación corre en una transacción SQLite.
- No se guardan claves de OCR ni archivos en Git.
- Un borrador no altera stock, compras, costos ni precios.
