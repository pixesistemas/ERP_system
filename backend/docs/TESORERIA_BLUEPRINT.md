# Módulo Tesorería - Blueprint

## Objetivo

Gestionar cobranzas, pagos, cajas, bancos, medios de pago, recibos, cuenta corriente y conciliaciones dentro del ERP.

## Conceptos principales

### Cuenta corriente

La cuenta corriente del cliente funciona como un libro mayor:

- Factura: genera DEBE.
- Recibo / Cobro: genera HABER.
- Nota de crédito: genera HABER.
- Nota de débito: genera DEBE.

### Recibo

Un recibo representa una cobranza formal al cliente.

Puede tener uno o varios medios de pago:

- Efectivo
- Transferencia
- Tarjeta
- QR
- Mercado Pago
- Cheque
- Retención
- Nota de crédito

### Aplicaciones

Una aplicación indica qué cobro cancela qué factura.

Ejemplo:

```text
Factura A 0001-00001000 $100.000
Recibo 50 aplica $40.000
Saldo pendiente $60.000
```
