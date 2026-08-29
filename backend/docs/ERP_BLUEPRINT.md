# Pixe ERP Core - Blueprint

## Objetivo

Construir una plataforma ERP modular, multiempresa y preparada para IA, donde ARCA/AFIP sea un módulo más dentro de un sistema comercial, administrativo y operativo completo.

## Principios

- Multiempresa desde el inicio.
- API primero.
- Event-driven.
- Módulos desacoplados.
- Dominio de negocio separado de infraestructura.
- IA como interfaz natural del sistema.
- WhatsApp, React, FoxPro y n8n usando el mismo núcleo.
- Seguridad por API Key, usuarios, roles y permisos.
- Auditoría completa.

## Módulos principales

### Core

- Empresas
- Usuarios
- Roles
- Permisos
- API Keys
- Auditoría
- Eventos
- Workflow
- Configuración
- Plugins

### Comercial

- Clientes
- Contactos
- Vendedores
- Productos
- Listas de precios
- Notas de pedido
- Presupuestos
- Remitos
- Facturas
- Notas de crédito
- Notas de débito
- Comisiones

### Stock

- Depósitos
- Ubicaciones
- Movimientos
- Inventario
- Stock mínimo
- Transferencias
- Ajustes
- Series
- Lotes

### Tesorería

- Caja
- Bancos
- Tarjetas
- Transferencias
- Mercado Pago
- Cheques
- Cobranzas
- Pagos
- Recibos

### Compras

- Proveedores
- Órdenes de compra
- Recepción de mercadería
- Facturas de compra
- Cuenta corriente proveedores

### ARCA / AFIP

- WSAA
- WSFE
- Padrón
- Facturación electrónica
- CAE
- QR
- PDF
- Comprobantes asociados

### Document Engine

- PDF
- HTML preview
- Templates por empresa
- QR oficial
- Logos
- Factura A/B/C
- Remitos
- Presupuestos
- Notas de pedido

### IA

- Agente comercial
- Agente stock
- Agente financiero
- Agente compras
- Agente gerencial
- Interpretación de WhatsApp
- Confirmación antes de ejecutar acciones

## Workflow comercial inicial

```text
NOTA_PEDIDO
    ↓
PRESUPUESTO
    ↓
REMITO
    ↓
FACTURA
    ↓
COBRO
    ↓
RECIBO
```
