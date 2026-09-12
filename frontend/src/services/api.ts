const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

export type ApiError = Error & { status?: number };

function getToken() {
  return sessionStorage.getItem("afip_demo_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const baseMessage = payload.error || payload.message || "No se pudo completar la operación";
    const details = Array.isArray(payload.details) ? payload.details : [];
    const detailText = details.length
      ? `: ${details.map((detail: any) => typeof detail === "string" ? detail : [detail.descripcion, detail.solicitado != null ? `solicitado ${detail.solicitado}` : "", detail.disponible != null ? `disponible ${detail.disponible}` : ""].filter(Boolean).join(" — ")).join(" · ")}`
      : "";
    const error = new Error(`${baseMessage}${detailText}`) as ApiError;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export const api = {
  login(email: string, password: string, empresaId?: number) {
    return request<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, ...(empresaId ? { empresaId } : {}) }),
    });
  },
  me() {
    return request<any>("/auth/me");
  },
  sendMessage(input: { telefono: string; mensaje: string; canal?: string }) {
    return request<any>("/commercial-conversations/message", {
      method: "POST",
      body: JSON.stringify({ canal: "WEB", ...input }),
    });
  },
  listConversations() {
    return request<any>("/commercial-conversations?limit=30");
  },
  getConversation(id: number) {
    return request<any>(`/commercial-conversations/${id}`);
  },
  listProducts(q = "") { return request<any>(`/productos?q=${encodeURIComponent(q)}`); },
  createProduct(data: any) { return request<any>("/productos", { method: "POST", body: JSON.stringify(data) }); },
  updateProduct(id: number, data: any) { return request<any>(`/productos/${id}`, { method: "PUT", body: JSON.stringify(data) }); },
  deleteProduct(id: number) { return request<any>(`/productos/${id}`, { method: "DELETE" }); },
  importProducts(modo: string, filas: any[]) { return request<any>("/productos/importar", { method: "POST", body: JSON.stringify({ modo, filas }) }); },
  listClients(q = "") { return request<any>(`/clientes?q=${encodeURIComponent(q)}`); },
  createClient(data: any) { return request<any>("/clientes", { method: "POST", body: JSON.stringify(data) }); },
  updateClient(id: number, data: any) { return request<any>(`/clientes/${id}`, { method: "PUT", body: JSON.stringify(data) }); },
  deleteClient(id: number) { return request<any>(`/clientes/${id}`, { method: "DELETE" }); },
  consultarPadron(cuit: string) { return request<any>(`/padron/${cuit}`); },
  listStock() { return request<any>("/stock"); },
  stockEntry(data: any) { return request<any>("/stock/entrada", { method: "POST", body: JSON.stringify(data) }); },
  stockExit(data: any) { return request<any>("/stock/salida", { method: "POST", body: JSON.stringify(data) }); },
  listStockMovements() { return request<any>("/stock/movimientos?limit=100"); },
  listSales() { return request<any>("/historial/facturas?limit=100"); },
  listDocuments(tipo = "") { return request<any>(`/documentos${tipo ? `?tipo=${encodeURIComponent(tipo)}` : ""}`); },
  getDocument(id: number) { return request<any>(`/documentos/${id}`); },
  generateDocumentPdf(id: number) { return request<any>(`/documentos/${id}/pdf`, { method: "POST" }); },
  convertDocument(id:number,nuevoTipo:string,body?:any){ return request<any>(`/documentos/${id}/convertir`,{method:'POST',body:JSON.stringify({nuevoTipo,...(body||{})})}); },
  changeDocumentStatus(id:number,estado:string){ return request<any>(`/documentos/${id}/estado`,{method:'PATCH',body:JSON.stringify({estado})}); },
  getClientAccount(documento: string) { return request<any>(`/clientes/cc/${encodeURIComponent(documento)}`); },
  collectClientAccount(data: any) { return request<any>("/clientes/cc/cobro", { method: "POST", body: JSON.stringify(data) }); },
  listReceipts() { return request<any>("/recibos"); },
  getReceipt(id:number) { return request<any>(`/recibos/${id}`); },
  async downloadReceiptPdf(id:number, filename:string) {
    const token=getToken();
    const response=await fetch(`${API_URL}/recibos/${id}/pdf`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
    if(!response.ok){const p=await response.json().catch(()=>({}));throw new Error(p.error||"No se pudo generar el PDF")}
    const blob=await response.blob(); const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=filename; link.click(); URL.revokeObjectURL(url);
  },
  getCompanySettings() { return request<any>("/configuracion/empresa"); },
  saveCompanySettings(data: any) { return request<any>("/configuracion/empresa", { method: "PUT", body: JSON.stringify(data) }); },
  getAppEstado() { return request<any>("/erp/app/estado"); },
  listWhatsappConversations(){return request<any>(`/erp/whatsapp/conversaciones`);},
  tomarConversacionWhatsapp(id:number,moderador:boolean){return request<any>(`/erp/whatsapp/conversaciones/${id}`,{method:'PATCH',body:JSON.stringify({moderador})});},
  crearPedidoWhatsapp(id:number){return request<any>(`/erp/whatsapp/conversaciones/${id}/crear-pedido`,{method:'POST'});},
  enviarMensajeWhatsapp(id:number,mensaje:string){return request<any>(`/erp/whatsapp/conversaciones/${id}/mensaje`,{method:'POST',body:JSON.stringify({mensaje})});},
  listWhatsappNotificaciones(){return request<any>(`/erp/whatsapp/notificaciones`);},
  marcarNotificacionEnviada(id:number){return request<any>(`/erp/whatsapp/notificaciones/${id}`,{method:'PATCH'});},
  listCuponesSorteo(){return request<any>(`/erp/sorteos/cupones`);},
  updateCuponSorteo(id:number,estado:string){return request<any>(`/erp/sorteos/cupones/${id}`,{method:'PATCH',body:JSON.stringify({estado})});},
  getWhatsappConfig(){return request<any>(`/erp/whatsapp/config`);},
  saveWhatsappConfig(data:any){return request<any>(`/erp/whatsapp/config`,{method:'PUT',body:JSON.stringify(data)});},
  probarWhatsappConfig(){return request<any>(`/erp/whatsapp/config/probar`,{method:'POST'});},
  enviarNotificacionWhatsapp(id:number){return request<any>(`/erp/whatsapp/notificaciones/${id}/enviar`,{method:'POST'});},
  listWhatsappPedidos(){return request<any>(`/erp/whatsapp/pedidos`);},
  cambiarRepartoPedido(id:number,estado:string){return request<any>(`/erp/whatsapp/pedidos/${id}/reparto`,{method:'PATCH',body:JSON.stringify({estado})});},
  enviarLinkPago(id:number){return request<any>(`/erp/whatsapp/pedidos/${id}/enviar-pago`,{method:'POST'});},
  verificarPago(id:number){return request<any>(`/erp/whatsapp/notificaciones/${id}/verificar-pago`,{method:'PATCH'});},
  whatsappDemoMessage(telefono:string,mensaje:string,nuevo?:boolean){return request<any>(`/erp/whatsapp/demo-message`,{method:'POST',body:JSON.stringify({telefono,mensaje,nuevo:!!nuevo})});},
  whatsappDemoEmpleadoMessage(telefono:string,mensaje:string,nuevo?:boolean){return request<any>(`/erp/whatsapp/demo-empleado-message`,{method:'POST',body:JSON.stringify({telefono,mensaje,nuevo:!!nuevo})});},
  whatsappResumenNotificaciones(){return request<any>(`/erp/whatsapp/resumen-notificaciones`);},
  async generarDocumentoPdf(id:number):Promise<{pdfUrl:string}>{
    const r=await request<any>(`/documentos/${id}/pdf`,{method:'POST'});
    const raw=r.pdf?.publicUrl||r.pdf?.url||r.documento?.pdf_url||null;
    if(!raw)throw new Error('No se pudo generar el PDF.');
    const url=String(raw).startsWith('http')?String(raw):new URL(API_URL).origin+raw;
    window.open(url,'_blank');
    return {pdfUrl:url};
  },
  listChangelog() { return request<any>("/erp/changelog"); },
  listUsers() { return request<any>("/users"); },
  createUser(data: any) { return request<any>("/users", { method: "POST", body: JSON.stringify(data) }); },
  setUserActive(id: number, activo: boolean) { return request<any>(`/users/${id}/activo`, { method: "PATCH", body: JSON.stringify({ activo }) }); },
  changeUserRole(id: number, rol: string) { return request<any>(`/users/${id}/rol`, { method: "PATCH", body: JSON.stringify({ rol }) }); },
  listUserPointsOfSale(id: number) { return request<any>(`/users/${id}/puntos-venta`); },
  saveUserPointsOfSale(id: number, data: any) { return request<any>(`/users/${id}/puntos-venta`, { method: "PUT", body: JSON.stringify(data) }); },
  listRoles() { return request<any>("/roles"); },
  createRole(data: any) { return request<any>("/roles", { method: "POST", body: JSON.stringify(data) }); },
  deleteRole(id: number) { return request<any>(`/roles/${id}`, { method: "DELETE" }); },
  saveRoleScreens(id: number, pantallas: string[]) { return request<any>(`/roles/${id}/pantallas`, { method: "PUT", body: JSON.stringify({ pantallas }) }); },
  listWhatsappOrderRequests(estado?: string) { return request<any>(`/whatsapp/clientes${estado ? `?estado=${estado}` : ""}`); },
  approveWhatsappOrderRequest(id: number, data: any) { return request<any>(`/whatsapp/clientes/${id}/aprobar`, { method: "POST", body: JSON.stringify(data) }); },
  rejectWhatsappOrderRequest(id: number) { return request<any>(`/whatsapp/clientes/${id}/rechazar`, { method: "POST" }); },
  reactivarWhatsappOrderRequest(id: number) { return request<any>(`/whatsapp/clientes/${id}/reactivar`, { method: "POST" }); },
};

export const erpApi = {
  listBanks: () => request<any>('/erp/bancos'),
  bankReconciliation: () => request<any>('/erp/bancos/reconciliacion'),
  createBank: (data:any) => request<any>('/erp/bancos',{method:'POST',body:JSON.stringify(data)}),
  updateBank: (id:number,data:any) => request<any>(`/erp/bancos/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  listPointsOfSale: () => request<any>('/erp/puntos-venta'),
  createPointOfSale: (data:any) => request<any>('/erp/puntos-venta',{method:'POST',body:JSON.stringify(data)}),
  updatePointOfSale: (id:number,data:any) => request<any>(`/erp/puntos-venta/${id}`,{method:'PUT',body:JSON.stringify(data)}),
  listChecks: (states='') => request<any>(`/erp/cheques${states?`?states=${encodeURIComponent(states)}`:''}`),
  createCheck: (data:any) => request<any>('/erp/cheques',{method:'POST',body:JSON.stringify(data)}),
  depositChecks: (data:any) => request<any>('/erp/cheques/depositos',{method:'POST',body:JSON.stringify(data)}),
  listWhatsappAuthorized: () => request<any>('/erp/whatsapp-autorizados'),
  saveWhatsappAuthorized: (data:any,id?:number) => request<any>(id?`/erp/whatsapp-autorizados/${id}`:'/erp/whatsapp-autorizados',{method:id?'PUT':'POST',body:JSON.stringify(data)}),
  listFiscalFiles: () => request<any>('/erp/empresa/archivos-fiscales'),
  getAppEstado: () => request<any>('/erp/app/estado'),
  listPurchases: (month?:number,year?:number) => request<any>(`/erp/compras?${new URLSearchParams({...(month?{month:String(month)}:{}),...(year?{year:String(year)}:{})}).toString()}`),
  createPurchase: (data:any) => request<any>('/erp/compras',{method:'POST',body:JSON.stringify(data)}),
  deletePurchase: (id:number) => request<any>(`/erp/compras/${id}`,{method:'DELETE'}),
  getVatBook: (month:number,year:number,pv?:number) => request<any>(`/erp/libro-iva?month=${month}&year=${year}${pv?`&pv=${pv}`:''}`),
  updatePrices: (data:any) => request<any>('/erp/precios/actualizacion-masiva',{method:'POST',body:JSON.stringify(data)}),
  getBorradorIva: (month:number,year:number,pv?:number) => request<any>(`/erp/pos/borrador-iva?month=${month}&year=${year}${pv?`&pv=${pv}`:''}`),
  saveBorradorIvaAjuste: (data:any) => request<any>('/erp/pos/borrador-iva/ajustes',{method:'POST',body:JSON.stringify(data)}),
  renameBorradorIvaRubro: (id:number,nombre:string) => request<any>(`/erp/pos/borrador-iva/rubros/${id}`,{method:'POST',body:JSON.stringify({nombre})}),
  listReserveFunds: () => request<any>('/erp/reservas-monto'),
  createReserveFund: (data:any) => request<any>('/erp/reservas-monto',{method:'POST',body:JSON.stringify(data)}),
  consumeReserveFund: (id:number,data:any) => request<any>(`/erp/reservas-monto/${id}/consumos`,{method:'POST',body:JSON.stringify(data)}),
  listPosCatalogs: () => request<any>('/erp/pos/catalogos'),
  misPuntosVenta: () => request<any>('/erp/pos/mis-puntos-venta'),
  uploadPointOfSaleLogo: (id:number,logo:string) => request<any>(`/erp/pos/puntos-venta/${id}/logo`,{method:'PUT',body:JSON.stringify({logo})}),
  listPosComprobantesConfig: () => request<any>('/erp/pos/comprobantes-config'),
  savePosComprobanteConfig: (tipo: string, cfg: any) => request<any>(`/erp/pos/comprobantes-config/${encodeURIComponent(tipo)}`, { method: 'PUT', body: JSON.stringify(cfg) }),
  createPosOperation: (data:any) => request<any>('/erp/pos/operaciones',{method:'POST',body:JSON.stringify(data)}),
  getPosDrafts: () => request<any>('/erp/pos/borradores'),
  savePosDrafts: (draft:any) => request<any>('/erp/pos/borradores',{method:'PUT',body:JSON.stringify({draft})}),
  deletePosDrafts: () => request<any>('/erp/pos/borradores',{method:'DELETE'}),
  listPosOperations: () => request<any>('/erp/pos/operaciones?limit=200'),
  listCardCollections: () => request<any>('/erp/pos/cobros-tarjetas'),
  reporteProductos: (from: string, to: string) => request<any>(`/erp/pos/reporte-productos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  rankingVentas: (desde: string, hasta: string) => request<any>(`/erp/pos/ranking-ventas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`),
  reporteVentas: (params: { desde?: string; hasta?: string; tipos?: string[]; estado?: string; vendedor_id?: number; cliente_id?: number; producto_id?: number; codigo?: string }) => {
    const qs = new URLSearchParams();
    if (params.desde) qs.set('desde', params.desde);
    if (params.hasta) qs.set('hasta', params.hasta);
    if (params.tipos?.length) qs.set('tipos', params.tipos.join(','));
    if (params.estado) qs.set('estado', params.estado);
    if (params.vendedor_id) qs.set('vendedor_id', String(params.vendedor_id));
    if (params.cliente_id) qs.set('cliente_id', String(params.cliente_id));
    if (params.producto_id) qs.set('producto_id', String(params.producto_id));
    if (params.codigo) qs.set('codigo', params.codigo);
    return request<any>(`/erp/reporte-ventas?${qs.toString()}`);
  },
  listPosOperationItems: (id:number) => request<any>(`/erp/pos/operaciones/${id}/items`),
  listComisiones: () => request<any>('/comisiones'),
  posRetryFiscal: (id:number) => request<any>(`/erp/pos/operaciones/${id}/fiscal/reintentar`,{method:'POST',body:JSON.stringify({})}),
  posNotaCredito: (id:number,body?:any) => request<any>(`/erp/pos/operaciones/${id}/nota-credito`,{method:'POST',body:JSON.stringify(body||{})}),
  posNotaDebito: (id:number,body?:any) => request<any>(`/erp/pos/operaciones/${id}/nota-debito`,{method:'POST',body:JSON.stringify(body||{})}),
  posFacturarPendiente: (id:number,body?:any) => request<any>(`/erp/pos/operaciones/${id}/facturar`,{method:'POST',body:JSON.stringify(body||{})}),
  posAnularOperacion: (id:number) => request<any>(`/erp/pos/operaciones/${id}/anular`,{method:'POST',body:JSON.stringify({})}),
  listCashSessions: () => request<any>('/erp/cajas/sesiones'),
  listCashSessionMedios: (id: number) => request<any>(`/erp/cajas/sesiones/${id}/medios`),
  getCashSession: (id:number) => request<any>(`/erp/cajas/sesiones/${id}`),
  closeCashSession: (id:number) => request<any>(`/erp/cajas/sesiones/${id}/arqueo-cerrar`,{method:'POST',body:JSON.stringify({})}),
  getState: (key:string) => request<any>(`/erp/resources/${encodeURIComponent(key)}`).catch((error:any)=>error?.status===404?request<any>(`/erp/state/${encodeURIComponent(key)}`):Promise.reject(error)),
  saveState: (key:string,value:any) => request<any>(`/erp/resources/${encodeURIComponent(key)}`,{method:'PUT',body:JSON.stringify({value})}).catch((error:any)=>error?.status===404?request<any>(`/erp/state/${encodeURIComponent(key)}`,{method:'PUT',body:JSON.stringify({value})}):Promise.reject(error)),
  deleteState: (key:string) => request<any>(`/erp/state/${encodeURIComponent(key)}`,{method:'DELETE'}),
  listModulos: () => request<any>('/erp/modulos'),
  listCobrosTemporales: (estado?:string) => request<any>(`/erp/cobros-temporales${estado?`?estado=${encodeURIComponent(estado)}`:''}`),
  createCobroTemporal: (data:any) => request<any>('/erp/cobros-temporales',{method:'POST',body:JSON.stringify(data)}),
  deleteCobroTemporal: (id:number) => request<any>(`/erp/cobros-temporales/${id}`,{method:'DELETE'}),
  enviarCobrosCuentaCorriente: (ids:number[]) => request<any>('/erp/cobros-temporales/enviar-cuenta-corriente',{method:'POST',body:JSON.stringify({ids})}),
  listDeposits: () => request<any>('/erp/cheques/depositos/listado'),
  reconcileDeposit: (id:number) => request<any>(`/erp/cheques/depositos/${id}/conciliar`,{method:'POST'}),
  listPaymentOrders: () => request<any>('/erp/ordenes-pago'),
  createPaymentOrder: (data:any) => request<any>('/erp/ordenes-pago',{method:'POST',body:JSON.stringify(data)}),
  closeCashWithCount: (id:number,data:any) => request<any>(`/erp/cajas/sesiones/${id}/arqueo-cerrar`,{method:'POST',body:JSON.stringify(data)}),
  openCash: (data:any) => request<any>('/erp/cajas/sesiones/abrir',{method:'POST',body:JSON.stringify(data)}),
  createCashMovement: (data:any) => request<any>('/erp/cajas/movimientos',{method:'POST',body:JSON.stringify(data)}),
  async printPosOperation(id:number){
    const token=getToken();const response=await fetch(`${API_URL}/erp/pos/operaciones/${id}/imprimir`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
    if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||'No se pudo preparar la impresión.');
    const html=await response.text(),win=window.open('','_blank');if(!win)throw new Error('El navegador bloqueó la ventana de impresión.');win.document.open();win.document.write(html);win.document.close();
  },
  async printPosVouchers(id:number){
    const token=getToken();const response=await fetch(`${API_URL}/erp/pos/operaciones/${id}/imprimir-regalos`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
    if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||'No se pudo preparar el vale.');
    const html=await response.text(),win=window.open('','_blank');if(!win)throw new Error('El navegador bloqueó la ventana del vale.');win.document.open();win.document.write(html);win.document.close();
  },
  async printPaymentOrder(id:number){
    const token=getToken();const response=await fetch(`${API_URL}/erp/ordenes-pago/${id}/imprimir`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
    if(!response.ok)throw new Error('No se pudo preparar la orden de pago.');
    const html=await response.text(),win=window.open('','_blank');if(!win)throw new Error('El navegador bloqueó la ventana.');win.document.open();win.document.write(html);win.document.close();
  },
  async uploadFiscalFile(type:'cert'|'key',file:File){
    const token=getToken(); const form=new FormData(); form.append('file',file);
    const response=await fetch(`${API_URL}/erp/empresa/archivos-fiscales/${type}`,{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:form});
    const payload=await response.json().catch(()=>({})); if(!response.ok)throw new Error(payload.error||'No se pudo subir el archivo.'); return payload;
  }
};
