# Pedidos por WhatsApp para clientes finales

## Qué resuelve
Hoy `whatsapp_autorizados` es una lista blanca cerrada para que **tu personal**
opere el sistema por WhatsApp (facturar, consultar stock, etc.). Esto es un
circuito **nuevo y separado**, pensado para que **tus clientes** hagan pedidos
por WhatsApp sin que nadie tenga que cargarlos a mano de antemano:

1. Un cliente le escribe a tu WhatsApp por primera vez → queda una solicitud
   **pendiente de aprobación** (no puede pedir todavía).
2. Un administrador la ve en **Pedidos por WhatsApp** (nueva pantalla) y la
   vincula a un cliente que ya existe, o crea uno nuevo con ese teléfono.
3. Una vez aprobado, ese número puede escribir en lenguaje natural para armar
   una **nota de pedido** — reutiliza el mismo motor conversacional que ya usa
   el asistente web, así que entiende "quiero 10 bolsas de cemento y 5 hierros
   del 6" igual que en el chat de la web.
4. Por este canal **solo puede pedir** — no puede facturar, no puede pedir
   presupuestos ni tocar nada más. Cualquier otro pedido se contesta con un
   mensaje explicando que por ahí solo se toman pedidos.
5. El pedido entra como una Nota de Pedido común — aparece en la pantalla
   **Notas de pedido** que ya usás, con el flujo de "Generar remito" que ya
   conectamos antes. No hace falta ninguna pantalla nueva para despachar.

## Lo que armé (backend + frontend)
- Tabla `whatsapp_clientes` (migración `037`): registra cada teléfono nuevo
  como `PENDIENTE`, y guarda a qué cliente quedó vinculado al aprobarlo.
- Middleware `whatsappClienteAuth.middleware.js`: a diferencia del de
  operadores, **no rechaza** números desconocidos — los registra como
  pendientes y corta ahí, antes de llegar al motor conversacional.
- Endpoint `POST /api/v1/whatsapp/pedidos/message`: mismo formato de mensaje
  que ya soporta el canal de operadores (`{mensaje: "..."}`, o el formato
  crudo de WhatsApp Cloud API), con el mismo mecanismo de
  `Idempotency-Key` para que los reintentos de WhatsApp/n8n no dupliquen
  pedidos.
- Endpoints admin `GET/POST /api/v1/whatsapp/clientes` (listar, aprobar,
  rechazar solicitudes).
- Pantalla **Pedidos por WhatsApp**: lista de solicitudes con botón para
  aprobar (eligiendo cliente existente o creando uno nuevo) o rechazar.

## Lo que falta — y no puedo hacerlo desde este entorno
Todo esto es **infraestructura externa al código**, no algo que se resuelva
programando:

1. **Una cuenta de WhatsApp Business de Meta**, con el número de teléfono que
   van a usar para recibir pedidos, verificado.
2. **Un flujo de n8n** (autohospedado o n8n cloud) que:
   - Reciba el webhook de WhatsApp cuando llega un mensaje.
   - Le haga `POST` al endpoint `/api/v1/whatsapp/pedidos/message` de este
     backend, con:
     - Header `x-api-key`: la API key de la empresa (la misma que ya usan
       para el canal de operadores).
     - Header `x-whatsapp-phone`: el teléfono del que escribió.
     - Header `Idempotency-Key`: un ID único del mensaje de WhatsApp (evita
       duplicados si WhatsApp reintenta el envío).
     - Body: `{"mensaje": "texto del cliente"}`.
   - Tome la `respuesta` que devuelve este backend y se la reenvíe al
     cliente por WhatsApp.
3. Probarlo de punta a punta con un número real, en homologación antes de
   producción.

Si ya tienen n8n conectado para el canal de operadores (`whatsapp_autorizados`),
el flujo es casi idéntico — solo cambia la URL de destino
(`/whatsapp/pedidos/message` en vez de `/whatsapp/conversations/message`) y
que acá cualquier número puede escribir (no hace falta autorizarlo antes en
`whatsapp_autorizados`).

## Limitación que dejé anotada, no resuelta
El motor todavía le pregunta el nombre al cliente dentro de la conversación
(no lo completa automáticamente aunque ya sepa a qué cliente está vinculado
ese teléfono). Es una mejora de UX menor — el pedido igual se arma bien,
solo que el cliente tiene que decir su nombre/razón social una vez. Dejé
preparado el lugar (`context.metadata.clienteId`) para conectarlo más
adelante si quieren esa mejora.

## Verificado
Sintaxis real de Node (`node --check`) en los 8 archivos backend nuevos o
modificados, y el mismo pipeline de TypeScript de siempre en el frontend — 0
errores. No pude probar el flujo conversacional de punta a punta (necesita
WhatsApp Business + n8n reales, que no existen en este entorno) — antes de
darlo por bueno, prueben con un número de prueba real.
