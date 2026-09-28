# API ARCA para sistemas externos (FoxPro)

El ERP expone una API que usa **el mismo certificado y punto de venta** que ya tenés configurado para ARCA. Sirve para que un sistema externo (por ejemplo, tu sistema en FoxPro) emita facturas, notas de crédito y notas de débito sin integrar AFIP por su cuenta.

## Activación

1. Superadmin → **Módulos** → tildar **"API ARCA (sistemas externos)"** en la empresa y guardar.
2. Obtener la **API Key** de la empresa: ERP → Configuración → **Bandeja WhatsApp** → tarjeta de conexión → campo **"API Key para n8n"** (es la misma API Key de la empresa).
3. (Opcional) Subdominio `arca.pixesistemas.com.ar`: Cloudflare → registro **A** `arca` → IP del servidor (Solo DNS) + Nginx Proxy Manager → Proxy Host `arca.pixesistemas.com.ar` → `172.17.0.1:3100` + Let's Encrypt.

## Direcciones

```
https://arca.pixesistemas.com.ar/api/v1/arca      (o https://erp.pixesistemas.com.ar/api/v1/arca)
```

Todas las llamadas llevan el header:

```
x-api-key: <API Key de la empresa>
Content-Type: application/json
```

## 1) Estado del servicio

`GET /api/v1/arca/estado`

```json
{
  "ok": true,
  "empresa": { "id": 4, "nombre": "Seitu", "cuit": "20234143403", "condicionIVA": "RESPONSABLE INSCRIPTO", "production": true, "puntoVenta": 5 },
  "fiscal": { "certificado": true, "ambiente": "PRODUCCION" }
}
```

## 2) Último comprobante autorizado

`GET /api/v1/arca/ultimo-comprobante?punto_venta=5&tipo=6`

- `tipo` es el código AFIP: `1` Factura A, `6` Factura B, `11` Factura C, `3` NC A, `8` NC B, `13` NC C, etc.

```json
{ "ok": true, "punto_venta": 5, "tipo": 6, "ultimo": 1234 }
```

## 3) Emitir comprobante

`POST /api/v1/arca/comprobantes`

```json
{
  "operacion": "FACTURA",
  "punto_venta": 5,
  "concepto": 1,
  "cliente": {
    "cuit": "20111111112",
    "razon_social": "CLIENTE DE PRUEBA",
    "condicion_iva": "CONSUMIDOR FINAL"
  },
  "items": [
    { "codigo": "A1", "descripcion": "Producto 1", "cantidad": 2, "precio_unitario": 1500, "descuento": 0, "iva": 21 }
  ]
}
```

- `operacion`: `FACTURA` (por defecto), `NOTA_CREDITO` o `NOTA_DEBITO`.
- La **letra A/B/C se resuelve sola** según la condición IVA de la empresa y del cliente (igual que en el ERP).
- `condicion_iva` del cliente: `RESPONSABLE INSCRIPTO`, `MONOTRIBUTO`, `EXENTO` o `CONSUMIDOR FINAL`.
- Para **notas**, agregar el comprobante original:

```json
"cbte_asoc": [ { "tipo": 6, "puntoVenta": 5, "numero": 1234 } ]
```

Respuesta:

```json
{
  "ok": true,
  "cae": "75123456789012",
  "cae_vencimiento": "2026-10-05",
  "numero": 1235,
  "punto_venta": 5,
  "tipo_comprobante": 6,
  "letra": "B",
  "nombre_comprobante": "FACTURA B",
  "importe_neto": 3000,
  "importe_iva": 630,
  "importe_total": 3630,
  "resultado": "A",
  "observaciones": null,
  "errores": null
}
```

## Errores

| Código | Significado |
|---|---|
| 400 | Faltan datos (items, tipo, cbte_asoc en notas) |
| 401 | Falta o es inválida la `x-api-key` |
| 403 | El módulo "API ARCA" no está tildado para la empresa |
| 422 | ARCA rechazó el comprobante (mirar `errores`/`observaciones`) |
| 502 | No se pudo consultar ARCA (red/certificado) |
| 503 | ARCA no respondió: reintentar (el intento queda registrado) |

## Ejemplo desde FoxPro (Visual FoxPro)

```foxpro
LOCAL loHttp, lcUrl, lcJson, lcResp
loHttp = CREATEOBJECT("WinHttp.WinHttpRequest.5.1")
lcUrl = "https://arca.pixesistemas.com.ar/api/v1/arca/comprobantes"

lcJson = '{"operacion":"FACTURA","punto_venta":5,' + ;
         '"cliente":{"cuit":"20111111112","razon_social":"CLIENTE","condicion_iva":"CONSUMIDOR FINAL"},' + ;
         '"items":[{"codigo":"A1","descripcion":"Producto","cantidad":1,"precio_unitario":1000,"iva":21}]}'

loHttp.Open("POST", lcUrl, .F.)
loHttp.SetRequestHeader("Content-Type", "application/json")
loHttp.SetRequestHeader("x-api-key", "TU_API_KEY")
loHttp.Send(lcJson)

lcResp = loHttp.ResponseText   && JSON con cae, numero, vencimiento...
```

## Notas importantes

- La API **emite** el comprobante y devuelve el CAE; cada intento queda registrado en el ERP (tabla `fiscal_intentos`) para auditoría.
- El comprobante **no se registra como venta** en el ERP (el sistema FoxPro sigue manejando su propia venta). Si más adelante querés que también quede la venta/documento en el ERP, se puede agregar con un campo `registrar: true`.
- El punto de venta debe existir y estar activo para la empresa; si no mandás `punto_venta` se usa el de la empresa.
- Para producción, la empresa debe tener cargado el certificado y la clave en Empresa → Datos fiscales y ARCA.
