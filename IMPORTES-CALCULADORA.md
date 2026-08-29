# Importes tipo calculadora

## Qué se agregó
- `utils/calc.ts`: evaluador seguro de expresiones (+, -, *, /, paréntesis,
  coma o punto decimal) — no usa `eval`, es un parser propio. Probado con 13
  casos (números simples, operaciones combinadas, paréntesis, división por
  cero, texto inválido, espacios).
- `components/shared/MoneyInput.tsx`: reemplaza a los `<input type="number">`
  sueltos. Muestra el signo de moneda a la izquierda, selecciona todo el texto
  al enfocar, y al salir del campo (o Enter) reemplaza lo escrito por el
  resultado calculado. Si la expresión no es válida, marca el campo en rojo
  sin perder lo escrito. Mantiene el atajo `*` para completar el importe
  faltante donde ya existía (pagos del POS y de cuenta corriente).

## Dónde ya se aplicó
- **Punto de venta**: precio unitario, precio de línea del carrito, los 5
  medios de pago, e importe de cada cheque cargado.
- **Cuentas corrientes**: los 5 medios de pago del cobro e importe de cada
  cheque.
- **Productos**: precio de costo, precio de venta, precio editable en la
  grilla, costo por proveedor.
- **Reservas por monto**: importe entregado.

Los porcentajes (descuento %, recargo %, IVA) los dejé como estaban — no son
importes en moneda, y aplicarles el signo $ hubiera sido confuso.

## Lo que falta (no llegué por tiempo)
Quedan con `<input type="number">` simple: Presupuestos, Remitos/Notas de
pedido (importes manuales si los hay), Compras, Cheques (alta manual),
Órdenes de pago, Liquidación de tarjetas, y otros formularios con importes
sueltos. El componente ya está armado y probado — es cuestión de repetir el
mismo reemplazo mecánico que hice acá. Si quieren, en la próxima ronda sigo
por esas pantallas.

## Sobre "reserva por montos, el buscador de cliente se ve mal"
Revisé `SearchableClientSelect` y el CSS del modal de reserva: no encontré una
causa en el código que explique el recorte por la izquierda que se ve en la
captura — el título del modal también aparecía cortado, y ese texto no tiene
relación con el buscador, lo que sugiere que fue la captura de pantalla
recortada al pegarla, no un bug real de la app. Sí encontré y corregí un problema
real, más chico, en el mismo componente: el desplegable de búsqueda tenía un
ancho fijo de 760px sin importar el tamaño del modal que lo contiene, así que
en un modal más angosto (como el de reservas) se salía por la derecha. Ya
queda acotado al ancho disponible. Si el recorte por la izquierda persiste
después de esto, mandame una captura sin recortar para mirarlo de nuevo.

## Verificado
Sintaxis real de TypeScript + resolución de módulos (mismo pipeline de las
rondas anteriores) sobre los 62 archivos del frontend — 0 errores. El
evaluador de expresiones se probó aparte con 13 casos de prueba.

---

## Formato argentino en los campos de importe

Los campos de importe (`MoneyInput`) mostraban el número en dígitos simples
todo el tiempo (ej. "2000000"). Ahora, mientras estás escribiendo se ve así
para que sea fácil de editar, pero apenas salís del campo se formatea como
"2.000.000,00" (punto de miles, coma decimal). Como es un solo componente
compartido, el cambio aplica automáticamente en todos los lugares donde ya
se usa: punto de venta, cuentas corrientes, productos y reservas por monto.

Los totales de solo lectura (el "TOTAL A PAGAR" grande, por ejemplo) ya
venían con este formato desde antes — el problema estaba puntualmente en
los campos editables.
