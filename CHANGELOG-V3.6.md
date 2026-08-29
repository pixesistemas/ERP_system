# AFIP Conversacional Demo V3.6

## Consistencia del catálogo
- Rubro, subrubro, marca y unidad de medida asociados desde el CRUD de Productos.
- Subrubros filtrados según el rubro elegido.
- Proveedores administrados dentro de la ficha del producto; se retiró el acceso duplicado del menú.
- Listado de productos con información de rubro, subrubro y marca.

## Buscadores reutilizables
- Selector de productos con búsqueda por código, código de barras y descripción.
- Filtros adicionales por rubro, subrubro y marca.
- Selector buscable de clientes preparado para módulos con grandes volúmenes.
- Resultados ampliados y compatibles con navegación mediante teclado.

## Reporte dinámico de pedidos
- Ya no imprime la pantalla del ERP.
- Genera una vista independiente, en formato A4 horizontal, con encabezado de empresa, filtros, agrupaciones, subtotales y total general.
- Filtros separados de fecha de pedido y fecha de devolución.
- Filtros por rubro, subrubro y marca.
- Agrupación dinámica por vendedor, cliente, producto, rubro, subrubro y marca.

## Diseñador de comprobantes
- Nuevo módulo para configurar plantillas por empresa y tipo de documento.
- Formatos A4, A5 y ticket de 80 mm.
- Orientación, márgenes, tipografía, logo, QR/CAE, documento de origen, neto, IVA, encabezado y pie.
- Vista previa independiente.
- Conserva las reglas especiales ya definidas para presupuesto, remito, factura y recibo.

## Validación
- Sintaxis TypeScript/JSX verificada. La comprobación completa requiere ejecutar `npm install` para disponer de React, Vite y sus tipos.
