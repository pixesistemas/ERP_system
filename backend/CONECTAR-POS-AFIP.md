# Conectar el cierre del POS con WSAA/WSFE (CAE real)

Esto es un **parche puntual**, no un backend completo: solo se tocaron los 4 archivos
de esta carpeta (más 1 archivo de frontend). Cópienlos sobre las rutas equivalentes de
su repo real y no reemplacen el resto del backend con esto.

## Qué se descubrió
`erpConsolidation.controller.js#createPosOperation` (la función que atiende
`POST /erp/pos/operaciones`, o sea, cerrar una venta desde `AdvancedPosPage`) insertaba
la venta en `documentos_comerciales` / `ventas_pos` con una numeración **local**
(`pos_numeradores`), sin llamar nunca a AFIP — daba lo mismo elegir "Sí" (factura
electrónica) que "No" (nota de venta X): la única diferencia era el string guardado en
`tipo`. El módulo `afip/` (WSAA, WSFE, `BillingEngine`) ya estaba completo y correcto,
pero nada en el flujo del POS lo llamaba.

## Qué cambia este parche
Cuando `document_kind==='FACTURA_ELECTRONICA'` (botón "Sí"), `createPosOperation`
ahora:
1. Arma el comprobante con `afip/invoiceBuilder.js` (el mismo que ya usa
   `BillingEngine` — no se duplicó ninguna regla de resolución de tipo de comprobante,
   como pide `AGENTS.md`).
2. Llama a `AFIPClient.fromEmpresa(empresa).wsfe.createInvoice(...)` **antes** de tocar
   la base — es una llamada de red, no puede ir dentro de la transacción sincrónica de
   `better-sqlite3`.
3. Si AFIP rechaza el comprobante → devuelve 422 con el detalle y **no se registra
   nada** (ni stock, ni caja, ni cuenta corriente).
4. Si AFIP autoriza → usa el número y los importes que devuelve AFIP (no el contador
   local) y guarda CAE, vencimiento, letra y resultado en `documentos_comerciales`
   (columnas nuevas, migración `035`).

Elegir "No" (Nota de Venta X) sigue exactamente igual que antes — no toca AFIP, no
requiere CAE, sigue usando la numeración local.

## Pasos para aplicar
1. Copiar los 4 archivos de `backend/` (respetando las rutas) sobre su repo real.
2. Copiar `frontend/src/components/pages/AdvancedPosPage.tsx` sobre el suyo (o, si ya
   aplicaron el refactor del frontend de la entrega anterior, ya viene incluido ahí).
3. Correr `npm run db:migrate` — agrega las columnas nuevas sin tocar datos existentes.
4. Completar en Configuración → Archivos fiscales el CUIT, certificado y clave de cada
   empresa que vaya a facturar por este camino. Si faltan, el POS ahora devuelve un
   error claro en vez de intentar facturar con datos incompletos.
5. Probar primero contra **homologación** (`production=false` en la empresa) antes de
   apuntar a producción.

## Lo que NO pude verificar acá
No hay red ni `node_modules` en este entorno, así que no pude:
- Correr `npm install` ni levantar el servidor real.
- Probar la llamada real contra los servidores de homologación de AFIP.
- Verificar el flujo de punta a punta (POS → CAE → impresión) tal como pide
  `AGENTS.md` para cambios financieros o de stock.

Lo que sí verifiqué: sintaxis real de los 4 archivos con el parser de Node
(`node --check`), que todos los `require()` agregados apuntan a módulos que existen en
el repo, y que la lógica reutiliza los mismos módulos (`afip/invoiceBuilder`,
`afip/fiscal.constants`, `AFIPClient`) que ya usa `facturas.controller.js` y
`billingEngine.js` en el resto del sistema — no inventé un camino nuevo. Antes de
darlo por bueno, corran la prueba de punta a punta contra homologación que pide su
propio `AGENTS.md`.

---

## Segunda parte: unificar comprobantes (ticket, diseñador, QR/CAE)

### Lo que encontré
Había 3 generadores de documentos separados: uno para facturas (con QR/CAE ya
correcto), otro para presupuestos/remitos/notas de pedido (sin CAE, no lo necesitan),
y un tercero **hardcodeado dentro del controlador** solo para el ticket del POS — sin
QR, sin CAE, sin conexión con el diseñador.

También quiero corregir algo que dije mal en el chat: `PointOfSalesPage`, `CompanyPage`
y `DocumentDesignerPage` no eran almacenamiento local desconectado como afirmé — hay un
puente (`readResource`/`writeResource` en `beta2.controller.js`) que ya los conecta a
tablas reales. El bug real y preciso era otro: el diseñador de comprobantes **sí**
guardaba en una tabla real (`comprobante_plantillas`), pero **ningún motor de PDF la
leía** — quedaba guardado sin ningún efecto.

### Qué se hizo
1. **Nuevo motor unificado de ticket** (`documents/engine/ticketDocumentEngine.js` +
   plantilla `documents/templates/ticket/ticket.html`): reemplaza el HTML hardcodeado
   de `printPosOperationV2`. Sirve tanto A4 como 80mm desde el mismo motor y muestra
   **QR de ARCA + CAE + vencimiento** cuando el comprobante está autorizado.
2. **`formato_impresion` (A4/80mm) ahora se puede guardar de verdad** vía
   `/erp/puntos-venta` (antes la columna existía pero ningún endpoint la escribía).
3. **El pie de página y el tamaño de letra del diseñador ahora sí se aplican de
   verdad** a los 3 motores (facturas, documentos comerciales y ticket del POS) —
   agregué el placeholder `{{PIE}}` a las 10 plantillas de factura y a la plantilla
   comercial, y conecté los 3 motores a la tabla real `comprobante_plantillas`.
4. **`DocumentDesignerPage` quedó honesto**: saqué los campos que duplicaban
   `CompanyPage` (razón social, CUIT, domicilio, logo — esos ya son reales y viven ahí
   y nunca tuvieron efecto real en el diseñador) y dejé solo pie de página y tamaño de
   letra, que ahora sí hacen algo.

### Verificación hecha
- Sintaxis real de los 7 archivos backend tocados con `node --check`.
- Cada plantilla HTML cruzada placeholder por placeholder contra las claves que arma
  su motor correspondiente (coinciden exactamente, ninguno quedó huérfano).
- Frontend: el mismo pipeline de antes (parser real de TypeScript + resolución de
  módulos con stubs) — 0 errores de sintaxis, 0 problemas de imports en los 60
  archivos.

### Lo que NO llegué a hacer
- No toqué la carpeta `pdf/templates/official/` — está huérfana (nada la referencia),
  no la usé para no sumar más superficie sin poder probarla.
- No revisé si `PurchasesPage`/otras pantallas similares tienen el mismo patrón de
  bug (almacenamiento local vs. puente real) — quedó pendiente si quieren que lo mire.
- Nada de esto se probó visualmente (no hay navegador ni Puppeteer con red en este
  entorno) — antes de darlo por bueno, generen una factura y un ticket de prueba en
  homologación y mírenlos.
