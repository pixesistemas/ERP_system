# Dos bugs reales, con causa encontrada

## 1. El `*` no completa el importe faltante
Era un bug mío en `MoneyInput` (el componente que agregué para los importes
tipo calculadora). Cuando presionabas `*`, el valor SÍ se actualizaba por
dentro — pero el campo tenía una protección para no pisar lo que estás
escribiendo mientras el campo tiene el foco, y esa protección también
bloqueaba la actualización que venía del `*`. El total y el vuelto se
calculaban bien; lo que fallaba era solo lo que se veía en el campo.
Corregido: `MoneyInput.tsx`.

## 2. "The paths[0] argument must be of type string" al facturar
Esto sí era una cadena de problemas reales, no uno solo:

- La pantalla **Empresa → Datos fiscales y ARCA**, donde se supone que subís
  el certificado (.crt) y la llave (.key) de ARCA, en realidad **no los
  mandaba al servidor** — los leía en el navegador y los guardaba como texto
  dentro de una configuración que nadie más usa. Parecía funcionar (mostraba
  el nombre del archivo) pero el archivo real nunca llegaba a donde
  `AFIPClient` lo necesita.
- Encima, el endpoint del backend que sí sube el archivo de verdad lo
  registraba en una tabla aparte (`empresa_archivos_fiscales`) sin actualizar
  las columnas (`cert_path`, `key_path`) que `AFIPClient` realmente lee. O
  sea: aunque hubieras logrado subirlo por otro lado, tampoco se hubiera
  conectado.
- Y la carpeta de caché de AFIP (`cache_path`, donde se guarda el token de
  sesión) no tiene forma de cargarse desde ninguna pantalla — si esa columna
  queda vacía, el sistema explota justo con el error que viste
  (`path.join` recibe `undefined` como primer argumento).

**Qué se corrigió:**
- La pantalla de empresa ahora sí sube el certificado y la llave al
  servidor de verdad, y muestra qué archivo está cargado.
- Subir el archivo ahora también actualiza `cert_path`/`key_path` en la
  empresa — antes quedaba solo en la tabla de registro, sin conectar.
- Si a una empresa le falta la carpeta de caché, el sistema ahora la resuelve
  sola (`storage/private/fiscal/cache/<nombre-empresa>`) en vez de romperse.
  El certificado y la llave siguen necesitando que los subas vos — eso no se
  puede inventar solo, son credenciales reales.

## Con esto, para que la factura electrónica funcione
1. Andá a **Empresa → Datos fiscales y ARCA**.
2. Subí el certificado (.crt) y la llave privada (.key) que les dio ARCA para
   esa empresa (los mismos que ya usaban antes de estas mejoras, si los
   tenían en algún lado, o los que generen para homologación).
3. Confirmá que el CUIT de la empresa esté cargado.
4. Probá una factura desde el punto de venta.

Sobre las facturas de ejemplo que mandaste (empresa1 / MATERIALES
MESOPOTAMICOS con CAE real): esas se generaron en algún momento por otro
camino del sistema donde el certificado sí estaba accesible — es la prueba
de que el circuito de AFIP en sí funciona bien; lo que fallaba era
específicamente la carga del certificado desde la pantalla nueva.

## Verificado
Sintaxis real de Node en los 2 archivos backend, mismo pipeline de
TypeScript de siempre en el frontend — 0 errores. No pude generar una
factura real de punta a punta en este entorno (sin red ni certificados de
prueba) — probá con tu certificado real después de aplicar esto.

---

## Actualización: el mismo error seguía después de subir los certificados

Subir el certificado y la llave (la corrección de arriba) resolvió la
primera capa del problema, pero apareció una tercera: el sistema firma el
pedido de acceso a AFIP usando el programa **OpenSSL** desde una variable de
entorno (`OPENSSL`) que **no estaba ni mencionada en el `.env.example`** —
nadie tenía forma de saber que había que configurarla. Sin ella,
`process.env.OPENSSL` es `undefined`, y el intento de resolver esa ruta
tira exactamente el mismo error genérico de Node
(`paths[0] argument must be of type string`).

**Qué se corrigió** (`src/afip/wsaa.service.js`):
- Si no está configurada la variable `OPENSSL`, ahora usa `openssl` a secas
  y deja que el sistema operativo lo busque en el PATH — funciona solo en
  Linux/Mac si tienen OpenSSL instalado (viene de fábrica en la gran
  mayoría de los casos).
- Si OpenSSL no se encuentra igual, ahora tira un mensaje claro
  ("No se encontró OpenSSL...") en vez del error genérico de Node.
- Agregué `OPENSSL=openssl` al `.env.example`, con una nota de qué poner en
  Windows (ruta al `openssl.exe` que trae Git, por ejemplo) si el nombre
  solo no alcanza.

Si después de este cambio el error persiste, lo más probable es que estés
en Windows sin OpenSSL accesible — contame qué sistema operativo usa el
servidor y seguimos desde ahí.


---

## Fila de cheques recibidos: campos amontonados

Era un problema de CSS puntual: la fila de cada cheque (número, banco,
librador, importe, vencimiento + botón "Quitar") usaba una grilla de ancho
fijo pensada para un panel más ancho del que realmente tiene tanto el modal
de cobro del POS como el panel de cuenta corriente. Con 5 campos angostos
más el botón sin columna propia, todo quedaba apretado y era imposible
escribir el importe del cheque — por eso "Cargado" se quedaba en $0,00 aunque
el campo CHEQUE de arriba tuviera un valor.

Cambié `.check-row` de una grilla de columnas fijas a un diseño flexible que
se acomoda solo al ancho disponible (cada campo con un ancho mínimo cómodo,
el botón "Quitar" siempre a la derecha). Aplica tanto al punto de venta como
a cuentas corrientes, porque los dos reusan la misma clase.

---

## El detalle del comprobante no cargaba (Notas de Venta X, Pedidos, etc.)

En `OperationalDocumentsPage` yo mismo había armado el detalle expandible
esperando que la lista de documentos ya trajera los ítems adentro — pero el
backend no los manda en el listado (por rendimiento, están en una tabla
aparte), solo al pedir un documento puntual. El resto del sistema
(`DocumentsPage`) ya tenía resuelto esto bien con un componente compartido
(`DocumentDetail`) que busca los ítems reales al expandir la fila. Reemplacé
mi versión por ese mismo componente en vez de mantener dos formas distintas
de hacer lo mismo — una de ellas rota.

---

## Indicador real de "certificado conectado" en Empresa

Como veníamos yendo un poco a ciegas con esto (la pantalla decía "Cargado"
pero eso solo confirma que el archivo se guardó, no que quedó conectado con
la facturación), agregué un indicador que lo dice explícitamente: al lado
de cada archivo ahora aparece en verde "conectado con la facturación" o en
rojo "todavía no conectado" — leído directo de las columnas que
`AFIPClient` realmente usa (`empresas.cert_path` / `key_path`), no de la
tabla de registro de subidas.

Si ves "todavía no conectado" después de este cambio, casi seguro es
porque el archivo se subió con una versión anterior del backend (antes de
que yo conectara `cert_path`/`key_path`) — subilo de nuevo (elegí el mismo
archivo otra vez) una vez que tengas este archivo actualizado, y debería
pasar a verde.
