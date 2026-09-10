# V4.0 Beta 2.2

## Reserva por monto

- El retiro se registra exclusivamente como `REMITO`.
- El cliente es obligatorio y debe coincidir con el titular de la reserva.
- El backend sustituye los precios enviados por los precios congelados del snapshot; no confía en el navegador.
- El remito descuenta stock y saldo reservado dentro de una misma transacción SQLite.
- No genera cobro, movimiento de caja ni deuda en cuenta corriente.
- La numeración utiliza el punto de venta activo.
- Se registra la relación entre reserva, venta interna, documento y número de remito.

## Impresión

- El remito no muestra precios ni totales comerciales.
- El valor declarado aparece en forma discreta.
- Mantiene el formato A4 o 80 mm configurado en el punto de venta.

## Continuidad en Codex y VS Code

- `AGENTS.md`: reglas obligatorias de implementación y pruebas.
- `PROJECT-CONTEXT.md`: arquitectura y decisiones comerciales vigentes.
- `ROADMAP.md`: estado real y próximas etapas.

## Base y pruebas

- Migración `034-reserve-fund-delivery-notes.js`.
- Prueba automática de precios congelados, ausencia de caja/pagos, salida de stock, consumo del saldo e impresión sin precios.

## Etapa fiscal (038)

- Tabla iscal_intentos con estado, intento, tipo de comprobante, letra, CAE, vencimiento, error y respuesta JSON.
- Columna documentos_comerciales.afip_estado (AUTORIZADO, RECHAZADO, PENDIENTE, SIN_CAE).
- Refactor de emisi�n: la misma funci�n atiende Factura, NC y ND con CbteAsoc.
- Errores de red identificados (FiscalNetworkError): la venta se registra PENDIENTE y no se pierde.
- Rechazo de ARCA: 422 con detalle y sin registro de venta.
- Reintento de CAE por operaci�n: POST /erp/pos/operaciones/:id/fiscal/reintentar.
- NC y ND sobre factura autorizada: POST /erp/pos/operaciones/:id/nota-credito|nota-debito con CbteAsoc y numeraci�n AFIP.
- Historial de ventas: columna de estado fiscal, CAE, botones de reintento, NC y ND.
- Aviso de CAE pendiente en el POS al cerrar venta.
- Prueba 	ests/beta3-fiscal.test.js con stub de WSFE: autorizaci�n, rechazo, ca�da de red, reintento y NC.

## Rediseño de comprobantes (039)

- Plantillas fiscales (facturaA/B/C, NC/ND y genérica) reescritas al estilo de referencia: header en 3 cajas (emisor, letra grande + Cod., datos de emisión), fila de fechas (vencimiento, servicio desde/hasta), cliente en 3 pares, tabla con IVA por renglón y CAE + vencimiento de CAE en el pie.
- documentEngine: nuevos placeholders EMPRESA_TELEFONO, EMPRESA_WHATSAPP, FECHA_VENCIMIENTO, FECHA_SERV_DESDE/HASTA, CLIENTE_CONDICION_VENTA y CLIENTE_PROVINCIA; tabla de 9 columnas con línea de IVA para comprobantes que discriminan.
- TotalsRenderer muestra la alícuota (IVA 21%) según los grupos del request.
- Plantilla comercial (presupuesto/remito/nota de pedido) y engine actualizados: letra P/X/N, Cod.0, ORIGINAL 1/1, numeración N° -PV-NUM, cliente en 3 pares y valor declarado aproximado en remitos.
- Plantilla de ticket del POS (A4 y 80 mm) con el mismo lenguaje visual; impresión trae domicilio, localidad, provincia, condición IVA del cliente y vencimiento del documento.
- Historial de ventas: reintento, NC y ND conectados al backend (antes solo listado).

### Letra, código y vendedor en comprobantes

- La letra (A/B/C según condición IVA emisor-receptor) y el código AFIP (Cod.1, Cod.6, Cod.11, etc.) se muestran en el header de todos los comprobantes (PDF fiscal y ticket POS, A4 y 80mm).
- El ticket de Factura A/NC-A/ND-A discrimina IVA: NETO, IVA y IMPORTE TOTAL (desde documentos_comerciales.importe_neto/importe_iva/importe_total).
- Vendedor visible en ticket POS (join vendedores) y en el PDF fiscal (request.vendedor desde billingEngine).

### Sello de agua en el campo de fecha (PDF fiscal)

- La palabra ORIGINAL en diagonal (gris tenue, rotada -35°) se muestra detrás de la Fecha de Emisión en el box-right del header, en los 10 comprobantes fiscales (Factura A/B/C, NC A/B/C, ND A/B/C).

## Lote UX y correcciones (040)

### POS

- Se quitó el texto "Seleccioná Sí para factura electrónica o No para nota de venta X." del modal de comprobante.
- Búsqueda por descripción: Flecha Abajo/Arriba navega entre sugerencias (resaltada), Enter carga la seleccionada y Escape cierra el menú.
- Cobro de venta: Flechas Arriba/Abajo se mueven entre los medios de pago y Enter confirma el cobro.
- Dos mecanismos de descuento/recargo independientes:
  - **General (inputs DESC./REC. en el resumen)**: envía `descuento_general`/`recargo_general` y el backend recalcula los totales del comprobante; se refleja en el PDF (el comportamiento de siempre).
  - **Ajuste de grilla (botón "Ajustar" + modal, -10 descuenta / 10 recarga)**: recalcula el precio unitario de cada renglón en pantalla y queda incrustado en los precios; NO envía `descuento_general`, por lo que el comprobante sale con esos precios y sin ninguna leyenda de descuento. Botón "Quitar" restaura los precios base.

### Facturas en varias hojas

- Configuración "Ítems por hoja A4" en Configuración > Punto de impresión (clave app_state pos_impresion.maxItemsPorHoja; 0 = sin límite).
- TicketDocumentEngine pagina facturas A4 que superan el límite: encabezado y cliente repetidos en cada hoja, totales solo en la última y cada hoja indica ORIGINAL 1/N, 2/N… Nunca pagina tickets de 80 mm ni remitos.
- En el detalle de ítems, cada renglón con descuento propio muestra "Dto X% (− $ Y)" en el comprobante impreso.

### Comprobantes comerciales (pantalla)

- Filtros: tipo, estado fiscal, canal, cliente y rango de fechas.
- Columnas nuevas: Cliente, Vendedor, Condición de pago, Estado AFIP (etiqueta de color) y CAE.
- El listado devuelve los ítems de cada documento (items_json con json_group_array sobre documento_items).

### Pedidos dinámicos

- Reporte reescrito: usa api.listDocuments('NOTA_PEDIDO') con los ítems reales de cada pedido (antes usaba una tabla inexistente y filtraba un tipo con espacio).
- Agrupación por VENDEDOR, CLIENTE o PRODUCTO, filtro de fechas e impresión del reporte.

### PDF desde Comprobantes

- El PDF de facturas, notas de venta X, NC y ND ahora usa el mismo motor que la impresión del POS (TicketDocumentEngine): muestra letra, código AFIP, CAE, QR, vendedor y el total discriminado cuando corresponde (antes usaba la plantilla comercial sin letra ni código).
- Los renglones del comprobante muestran el precio final por ítem (neto + IVA) y su subtotal final, de modo que la suma de los subtotales coincide exactamente con el total del comprobante (antes mostraban el neto y el total incluía el IVA, descuadrando la suma). El descuento individual por ítem también muestra su monto con IVA incluido. Los remitos siguen sin precios.

### Diagnóstico (sin cambio de código)

- El congelamiento del POS al cerrar venta es latencia real de ARCA (login/wsaa + último número + FECAESolicitar síncronos, ~1-5 s); el cliente SOAP ya está cacheado y el token dura 12 h. Si se quiere eliminar, hay que pasar la emisión a segundo plano.

## Lote IVA en POS y reportes (041)

### POS: precios finales con IVA

- La grilla muestra y edita el **precio final** (neto + IVA del producto); al editar, el neto se recalcula y se redondea a 4 decimales para que el comprobante cuadre.
- El subtotal por línea, el "Subtotal Bruto (IVA incluido)" del resumen y el total a pagar usan el precio final.
- El payload envía `subtotal` con IVA incluido y los ítems con `precio_unitario` neto + `iva`, de modo que el backend persiste `documento_items.total` e `iva_importe` con IVA (neto × (1 + alícuota)) y la suma de las líneas coincide exactamente con el `importe_total` del comprobante.
- El quick-entry de precio unitario se interpreta como precio final.

### Detalle de comprobantes

- `DocumentDetail` muestra precio y subtotal con IVA por ítem (usa el `total` persistido del renglón; la suma de la columna coincide con el total del comprobante).

### Comprobantes comerciales

- La observación de ARCA es colapsable: se muestra solo un botón "Ver observación" en la columna Estado AFIP (antes el texto largo rompía la fila).

### Centro de reportes con datos reales

- ReportsPage reescrito: consume la API real en lugar del almacenamiento local del navegador: `listPosOperations` (ventas por cajero/vendedor, rentabilidad con `costo_total` agregado al SELECT), `listComisiones` (nuevo método `api.listComisiones`), `listCashSessions` (sesiones de caja con resultado de la sesión) y `listDocuments` (IVA y notas de pedido).
- `listPosOperations` ahora trae `vendedor_nombre` (join vendedores) y `costo_total` (suma de costo × cantidad de los ítems).

### Pedidos dinámicos

- Agrupación de **dos dimensiones** (Agrupar por → Subgrupo) con Vendedor, Cliente, Producto, Estado y Canal.
- Totales por grupo y subgrupo (cantidad de ítems y monto), total general, filas expandibles y reporte imprimible con subtotales.
- Incluye notas de pedido del canal web **y** pedidos/reservas del POS (canal POS).

### Pruebas

- Smoke `tests/smoke-factura-c-pdf.js`: emite factura por POS con ítem gravado 21 % contra stub de WSFE y verifica que el ítem se persista con `total`/`iva_importe` con IVA, que la suma de líneas sea exactamente el `importe_total` y que el PDF fiscal muestre el total con IVA.

## Reportes de ventas (motor configurable)

- Nueva pantalla "Reportes de ventas" (menú CONFIGURACIÓN): una sola pantalla agrupa por vendedor, cliente o producto (N niveles combinables), con modo DETALLE/RESUMEN, columnas visibles (Cantidad, Código, Producto, Precio), ordenamiento por vendedor/cliente/producto/cantidad/precio ASC/DESC, búsqueda rápida y exportación CSV / Excel / PDF (imprimir).
- Los datos salen de la base real (`documentos_comerciales` + `documento_items` + clientes/vendedores) mediante el nuevo endpoint `GET /erp/reporte-ventas` con filtros de fecha, tipos de comprobante, estado, vendedor, cliente, producto y código.
- Cliente con dirección (como pedía la referencia) en el agrupamiento por cliente.
- Subtotales por grupo y TOTAL ACUMULADO de cantidad y precio. Sin comisión.

## Comprobante inicial de ventas

- Nueva configuración por empresa `tipo_inicial_venta` (migración 072): arranca la venta en NOTA_PEDIDO, PRESUPUESTO o FACTURA.
- UI en Configuración con checks exclusivos: "Arrancar en nota de pedido" y "Arrancar en presupuesto". Si no se marca ninguno, arranca en factura.
- El punto de venta arranca las pestañas vacías con el comprobante inicial configurado.

## Filtros en listados operativos

- Notas de venta, reservas, notas de pedido y remitos ahora filtran por ESTADO y VENDEDOR (además de fecha, punto de venta y búsqueda).

## Pantallas nuevas automáticas por rol

- Las pantallas nuevas del sistema se suman automáticamente a los roles que ya tenían una lista explícita de pantallas, sin tener que reconfigurar cada rol a mano.
- Migración 073: tabla `pantallas_registro` (alta de cada pantalla) y `roles.pantallas_actualizado_en` (última vez que se guardó el rol). Al instalar, se nivela una vez: se agregan a cada rol las pantallas actuales que le falten.
- A partir de ahí, al guardar un rol desde "Roles y permisos" se respeta lo que el administrador marque: las pantallas desmarcadas no se vuelven a agregar.
- `src/constants/pantallas.js`: lista canónica (mantener sincronizada con `frontend/src/utils/screens.ts`).
- `reconciliarPantallas()` corre al iniciar el servidor (bootstrap).
