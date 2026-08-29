# Pedidos, caja y cheques en cuenta corriente

## "Los pedidos no se tienen que registrar en caja" + "pedidos no se cargan bien"

Eran dos síntomas del mismo problema de fondo: `OperationalDocumentsPage` (la
pantalla de Notas de Pedido / Presupuestos / Remitos / Reservas) leía de
`afip_pos_documents`, una clave que **nunca llegó a conectarse** al backend real —
por eso la lista salía vacía o con "Cliente"/"-" en vez del nombre real: cuando
sí traía datos reales (solo para Nota de Pedido, con `api.listDocuments`), el
propio `SELECT` del backend no traía el nombre del cliente ni del vendedor.

No encontré, revisando el código, que un pedido efectivamente mueva la caja —
`createPosOperation` ya excluye el modo PEDIDO del bloque que registra
`caja_movimientos`. Es posible que lo que se veía como "se registra en caja" en
realidad fuera la confusión de ver `Cliente` como nombre literal y no un pedido
real. Si después de este cambio lo siguen viendo, avisen con una captura del lugar
puntual (reporte, cierre de caja, dashboard) donde aparece.

**Qué se corrigió:**
- `listDocumentos` (backend) ahora hace `JOIN` con `clientes` y `vendedores` — el
  nombre real aparece en vez de "Cliente"/"-".
- `OperationalDocumentsPage` se reescribió para leer siempre de `api.listDocuments`
  (dato real), y las acciones "Generar remito" y "Cancelar" en Nota de Pedido ahora
  llaman a los endpoints reales de conversión y cambio de estado que ya existían en
  el backend (`convertirDocumento`, `cambiarEstadoDocumento`) pero que la pantalla
  nunca usaba — antes escribían en el array local roto.
- Encontré además que el estado que graba el POS (`PENDIENTE`) no es uno de los
  estados que reconoce el motor de flujo del sistema (`BORRADOR`/`CONFIRMADO`/
  `FACTURADO`/`ANULADO`), así que ningún cambio de estado podía funcionar nunca
  para un pedido cargado desde el POS. Lo cambié a `BORRADOR` para que quede
  alineado.
- La acción "Devolución" la saqué: no encontré ningún endpoint de devoluciones en
  el backend (busqué en todo el código). Antes simulaba algo localmente que no
  tenía ningún efecto real. Prefiero que no esté a que parezca que funciona.
- Las pestañas REMITO, RESERVA y NOTA DE VENTA X ahora también muestran datos
  reales (antes mostraban lo mismo que Nota de Pedido, mal filtrado), pero no
  tienen botones de acción todavía — no encontré un circuito de backend
  verificado para "generar remito"/"cancelar" en esos tipos particulares y
  preferí no adivinar.

## "En cuenta corriente los cheques no te deja ingresar cheques nuevos"

La causa: la pantalla de cobro de cuenta corriente (`ClientAccountsPage`) solo
tenía un campo numérico para "CHEQUE" (un importe total), sin ningún lugar para
cargar el número, banco o vencimiento de cada cheque. El backend (`recibo_detalles`)
ya soporta guardar esos datos por cheque — nunca se llegó a usar desde acá.

**Qué se corrigió:** agregué el mismo bloque de carga de cheques que ya funciona
en el punto de venta (uno o más cheques, cada uno con número/banco/importe/
vencimiento), con validación de que la suma coincida con el importe cargado en
"CHEQUE" antes de dejar cobrar.

## Verificado
- Backend: sintaxis real con `node --check` en los 2 archivos tocados.
- Frontend: mismo pipeline de antes (parser real de TypeScript + resolución de
  módulos) — 0 errores de sintaxis, 0 problemas de imports.
- No pude probarlo contra la base de datos real ni de punta a punta (sin red en
  este entorno). Prueben especialmente: cargar un pedido desde el POS → verlo en
  Notas de Pedido con el cliente correcto → generar remito → cancelar uno.
