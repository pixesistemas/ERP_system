export const examples = [
  "Haceme un presupuesto para Juan Pérez por 10 bolsas de cemento y 5 hierros del 6",
  "Quiero hacer una factura para Consumidor Final",
  "Prepará un remito para Distribuidora Norte con 2 cementos",
  "Hacé una nota de pedido para Carlos por 3 barras de hierro",
];

export function moneyInputProps(onStar:()=>void){
  return {onFocus:(e:any)=>e.currentTarget.select(),onKeyDown:(e:any)=>{if(e.key==='*'){e.preventDefault();onStar();}}};
}

export function pageTitle(page:string){return ({dashboard:"Resumen",chat:"Asistente comercial",products:"Productos",pos:"Punto de venta",sales:"Historial de ventas",documents:"Comprobantes",budgets:"Presupuestos","sales-notes":"Notas de venta",reservations:"Reservas","reserve-funds":"Reservas por monto",orders:"Notas de pedido",remitos:"Remitos",stock:"Inventario","stock-moves":"Movimientos de stock",clients:"Clientes",suppliers:"Proveedores",cash:"Caja",accounts:"Cuentas clientes","cobro-temporal":"Cobro temporal",receipts:"Recibos de cobro",checks:"Cheques",cards:"Liquidación tarjetas","bank-list":"Bancos",banks:"Conciliación bancaria",branches:"Sucursales",cashiers:"Cajeros","branch-stock":"Stock por sucursal",combos:"Combos","quantity-discounts":"Descuentos por cantidad",promotions:"Promociones y regalos",raffles:"Cupones de sorteo",purchases:"Compras","vat-books":"Libro IVA","borrador-iva":"Borrador IVA","product-suppliers":"Proveedores por producto","check-deposits":"Depósito de cheques","payment-orders":"Órdenes de pago","cash-closures":"Cierres de caja",currencies:"Monedas y cotizaciones","stock-transfers":"Transferencias entre sucursales",reports:"Reportes","dynamic-orders-report":"Pedidos dinámicos","sales-reports":"Reportes de ventas","document-designer":"Diseñador de comprobantes","point-sales":"Puntos de venta",company:"Empresa","whatsapp-auth":"WhatsApp autorizados",settings:"Configuración",categories:"Rubros, subrubros y marcas",units:"Unidades de medida","price-update":"Actualización de precios",imports:"Importar productos","shelf-labels":"Precios de góndola",sellers:"Vendedores y comisiones",users:"Usuarios",roles:"Roles y permisos","whatsapp-orders":"Pedidos por WhatsApp",novedades:"Novedades del sistema","whatsapp-tray":"Bandeja WhatsApp","whatsapp-chat-demo":"Asistente WhatsApp","whatsapp-empleado":"Asistente Empleados"} as any)[page]||"Sistema comercial"}

export function pageSubtitle(page:string){return page==="dashboard"?"Indicadores, alertas y accesos rápidos del negocio.":page==="chat"?"Prepará operaciones usando lenguaje natural.":page==="products"?"Administrá el catálogo usado por web, n8n y WhatsApp.":page==="pos"?"Venta rápida con múltiples operaciones abiertas.":page==="novedades"?"Qué tiene de nuevo y qué se corrigió en cada versión.":page==="whatsapp-tray"?"Conversaciones de clientes por WhatsApp: tomá, devolvé al bot o creá el pedido.":"Módulo incorporado al diseño general del ERP."}

export function actionText(action:string) { return ({OMITIR_PRODUCTO:'omitilo',REEMPLAZAR_PRODUCTO:'reemplazalo por ',AGREGAR_OTRO:'quiero agregar otro producto',CONFIRMAR:'confirmar'} as any)[action] || action; }

export function actionLabel(action:string) { return ({OMITIR_PRODUCTO:'Omitir producto',REEMPLAZAR_PRODUCTO:'Reemplazar',AGREGAR_OTRO:'Agregar otro',CONFIRMAR:'Confirmar'} as any)[action] || action; }
